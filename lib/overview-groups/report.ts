import { Prisma, type PrismaClient } from "../generated/prisma/client";
import { calculateDashboardFinancials } from "../dashboard/calculations";
import { parseDashboardParams } from "../dashboard/params";
import type { DashboardAccountData } from "../dashboard/queries";

type ReadDb = Pick<PrismaClient, "$queryRaw">;
type GroupScope = { id: number; name: string; members: { shopeeAccountId: number; shopeeAccount?: { name: string } }[] };
type Amount = Prisma.Decimal | number | null;
const amount = (value: Amount) => value === null ? null : Number(value);
const orders = { date: "date", budget: "budget", costWithFee: "costWithFee", commission: "commission", profit: "profit", profitPercent: "profitPercent" };

function metaCte(ids: number[], from: string, to: string) {
  return Prisma.sql`
    WITH members AS (SELECT id FROM ShopeeAccount WHERE id IN (${Prisma.join(ids)})),
    scoped_wls AS (SELECT id,shopeeAccountId FROM MetaAccount WHERE shopeeAccountId IN (${Prisma.join(ids)})),
    scoped_campaigns AS (SELECT c.id,w.shopeeAccountId FROM Campaign c INNER JOIN scoped_wls w ON w.id=c.metaAccountId),
    spend_by_member AS (
      SELECT w.shopeeAccountId,s.date,SUM(s.spend) AS spend FROM MetaAccountDailySpend s
      INNER JOIN scoped_wls w ON w.id=s.metaAccountId GROUP BY w.shopeeAccountId,s.date
    ), commission_by_member AS (
      SELECT c.shopeeAccountId,dm.date,SUM(dm.commission) AS commission FROM CampaignDailyMetric dm
      INNER JOIN scoped_campaigns c ON c.id=dm.campaignId GROUP BY c.shopeeAccountId,dm.date
    ), dates AS (SELECT date FROM spend_by_member UNION SELECT date FROM commission_by_member),
    member_days AS (
      SELECT m.id,d.date,s.spend,
        CASE WHEN c.commission IS NOT NULL THEN c.commission
          WHEN EXISTS(SELECT 1 FROM ShopeeCommissionImport i WHERE i.shopeeAccountId=m.id AND d.date BETWEEN i.dateFrom AND i.dateTo) THEN 0
          ELSE NULL END AS commission
      FROM members m CROSS JOIN dates d
      LEFT JOIN spend_by_member s ON s.shopeeAccountId=m.id AND s.date=d.date
      LEFT JOIN commission_by_member c ON c.shopeeAccountId=m.id AND c.date=d.date
      WHERE (${from}='' OR d.date>=${from}) AND (${to}='' OR d.date<=${to})
    ), combined AS (
      SELECT date,
        SUM(spend) AS budget,
        COUNT(*)-COUNT(spend) AS missingSpendMemberCount,
        JSON_ARRAYAGG(CASE WHEN spend IS NULL THEN id ELSE NULL END) AS missingSpendMemberIds,
        CASE WHEN COUNT(commission)=(SELECT COUNT(*) FROM members) THEN SUM(commission) ELSE NULL END AS commission
      FROM member_days GROUP BY date
    ), daily_metrics AS (
      SELECT date,budget,missingSpendMemberIds,missingSpendMemberCount,budget*1.05 AS costWithFee,commission,commission-budget*1.05 AS profit,
        CASE WHEN budget=0 THEN NULL ELSE (commission-budget*1.05)/(budget*1.05)*100 END AS profitPercent
      FROM combined
    )`;
}

export async function getGroupPerformance(db: ReadDb, group: GroupScope, raw: Record<string, string | string[] | undefined>, wlCount: number) {
  const ids = group.members.map((m) => m.shopeeAccountId);
  if (ids.length < 2) throw new Error("Grup memerlukan minimal dua akun.");
  const state = parseDashboardParams(raw, [group.id]), requested = state.accounts[group.id];
  const cte = metaCte(ids, state.from, state.to);
  const [summary] = await db.$queryRaw<{ total: bigint; incomplete: bigint; spend: Amount; commission: Amount }[]>(Prisma.sql`${cte}
    SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN missingSpendMemberCount>0 OR commission IS NULL THEN 1 ELSE 0 END),0) AS incomplete,
      SUM(CASE WHEN budget IS NOT NULL AND commission IS NOT NULL THEN budget ELSE NULL END) AS spend,
      SUM(CASE WHEN budget IS NOT NULL AND commission IS NOT NULL THEN commission ELSE NULL END) AS commission
    FROM daily_metrics`);
  const total = Number(summary?.total ?? 0), pageCount = Math.max(1, Math.ceil(total / requested.pageSize));
  const page = Math.min(requested.page, pageCount);
  const rows = await db.$queryRaw<{ date: Date | string; budget: Amount; costWithFee: Amount; commission: Amount; profit: Amount; profitPercent: Amount; missingSpendMemberIds: (number | null)[] | string }[]>(Prisma.sql`${cte}
    SELECT date,budget,costWithFee,commission,profit,profitPercent,missingSpendMemberIds FROM daily_metrics
    ORDER BY ${Prisma.raw(orders[requested.sort])} IS NULL ASC, ${Prisma.raw(orders[requested.sort])} ${Prisma.raw(requested.dir === "asc" ? "ASC" : "DESC")},date DESC
    LIMIT ${requested.pageSize} OFFSET ${(page - 1) * requested.pageSize}`);
  const performance: DashboardAccountData = {
    id: group.id, name: group.name, wlCount,
    summary: calculateDashboardFinancials(amount(summary?.spend ?? null), amount(summary?.commission ?? null)),
    days: rows.map((r) => ({ date: typeof r.date === "string" ? r.date.slice(0, 10) : r.date.toISOString().slice(0, 10),
      budget: amount(r.budget), costWithFee: amount(r.costWithFee), commission: amount(r.commission), profit: amount(r.profit), profitPercent: amount(r.profitPercent) })),
    pagination: { total,page,pageCount,pageSize: requested.pageSize }, state: { ...requested,page },
  };
  const partialSpendByDate: Record<string, string[]> = {};
  const names = new Map(group.members.map((m) => [m.shopeeAccountId,m.shopeeAccount?.name ?? `Akun ${m.shopeeAccountId}`]));
  for (const row of rows) {
    const missing: (number | null)[] = typeof row.missingSpendMemberIds === "string" ? JSON.parse(row.missingSpendMemberIds) : row.missingSpendMemberIds;
    const ids = new Set(missing.filter((id): id is number => id !== null).map(Number));
    if (ids.size > 0) {
      const date = typeof row.date === "string" ? row.date.slice(0,10) : row.date.toISOString().slice(0,10);
      partialSpendByDate[date] = group.members.filter((m) => ids.has(m.shopeeAccountId)).map((m) => names.get(m.shopeeAccountId)!);
    }
  }
  return { performance,state,incompleteDays: Number(summary?.incomplete ?? 0),partialSpendByDate };
}

export async function getGroupReminders(db: ReadDb, ids: number[]) {
  const [[notes], wls] = await Promise.all([
    db.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT COUNT(*) AS count FROM CampaignDailyMetric dm
      INNER JOIN Campaign c ON c.id=dm.campaignId INNER JOIN MetaAccount w ON w.id=c.metaAccountId
      WHERE w.shopeeAccountId IN (${Prisma.join(ids)}) AND dm.completed=false AND dm.note IS NOT NULL AND TRIM(dm.note)<>''
    `),
    db.$queryRaw<{ id: number; shopeeAccountId: number; name: string; status: string; campaignCount: bigint; syncSucceeded: bigint }[]>(Prisma.sql`
      SELECT w.id,w.shopeeAccountId,w.name,w.status,COUNT(c.id) AS campaignCount,
        EXISTS(SELECT 1 FROM MetaSyncWlProgress p INNER JOIN MetaSyncRun r ON r.id=p.runId
          WHERE p.metaAccountId=w.id AND p.accountId=w.accountId AND r.shopeeAccountId=w.shopeeAccountId
          AND p.status='SUCCEEDED' AND p.phase='DONE' AND p.error IS NULL) AS syncSucceeded
      FROM MetaAccount w LEFT JOIN Campaign c ON c.metaAccountId=w.id
      WHERE w.shopeeAccountId IN (${Prisma.join(ids)})
      GROUP BY w.id,w.shopeeAccountId,w.name,w.status,w.accountId
      HAVING SUM(CASE WHEN c.metaStatus='ACTIVE' THEN 1 ELSE 0 END)=0
    `),
  ]);
  return { pendingNotes: Number(notes.count), wls: wls.map((w) => ({ ...w,
    message: Number(w.campaignCount) > 0 ? "Tidak ada campaign aktif pada data tersimpan."
      : Number(w.syncSucceeded) === 1 ? "Sync selesai, tidak ada campaign tersimpan."
      : "Belum terverifikasi melalui Sync Meta. Jalankan Sync Meta pada akun individual untuk memuat campaign WL baru.",
  })) };
}

export async function loadOverviewGroup(db: Pick<PrismaClient, "shopeeOverviewGroup">, id: number) {
  return db.shopeeOverviewGroup.findUnique({ where: { id }, include: { members: {
    orderBy: { shopeeAccountId: "asc" }, include: { shopeeAccount: { select: {
      id: true,name: true,status: true,lastMetaSyncAt: true,
      metaAccounts: { select: { id: true,name: true,status: true,accountId: true,businessManager: { select: { name: true } } } },
      commissionImports: { select: { createdAt: true },orderBy: { createdAt: "desc" },take: 1 },
      clickImports: { select: { createdAt: true },orderBy: { createdAt: "desc" },take: 1 },
      clickaduCampaignConfigs: { select: { campaignId: true,label: true,lastBlacklistReplacedAt: true } },
      adsterraCampaignConfigs: { select: { campaignId: true,label: true,lastBlacklistReplacedAt: true } },
    } } },
  } } });
}
export type OverviewGroupData = NonNullable<Awaited<ReturnType<typeof loadOverviewGroup>>>;
