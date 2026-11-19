import Decimal from "decimal.js";
import { Prisma,type PrismaClient } from "../generated/prisma/client";
import { parseDashboardParams } from "../dashboard/params";
import { calculateClickaduDailyFinancials,CLICKADU_USD_IDR_RATE } from "../clickadu-history/financials";
import { calculateAdsterraDailyFinancials,ADSTERRA_USD_IDR_RATE } from "../adsterra-history/financials";
import { parseClickaduOverviewParams } from "../dashboard/clickadu-overview-params";
import { parseAdsterraOverviewParams } from "../dashboard/adsterra-overview-params";

type Amount = Prisma.Decimal | number | null;
type FinancialRow = { shopeeAccountId: number; spendUsd: Amount; commissionIdr: Amount };
function financials(row: FinancialRow,calculate: typeof calculateClickaduDailyFinancials) {
  const spendUsd = row.spendUsd === null ? null : row.spendUsd.toString();
  const commissionIdr = row.commissionIdr === null ? null : row.commissionIdr.toString();
  const result = calculate(spendUsd,commissionIdr);
  return { ...row,spendUsd,commissionIdr,...result,profitPercent: result.spendIdr === null || result.profitIdr === null || new Decimal(result.spendIdr).isZero() ? null : new Decimal(result.profitIdr).div(result.spendIdr).mul(100).toString() };
}
// Two providers, not a loop over accounts: six SQL reads regardless of member count.
export async function getGroupTrafficReport(db: Pick<PrismaClient,"$queryRaw">,ids: number[],raw: Record<string,string | string[] | undefined>) {
  const range = parseDashboardParams(raw,[]);
  return Promise.all((["Clickadu","Adsterra"] as const).map(async (provider) => {
    const key = provider.toLowerCase();
    const state = provider === "Clickadu" ? parseClickaduOverviewParams(raw) : parseAdsterraOverviewParams(raw);
    const rate = provider === "Clickadu" ? CLICKADU_USD_IDR_RATE : ADSTERRA_USD_IDR_RATE;
    const order = Prisma.raw({date:"date",spendUsd:"spendUsd",spendIdr:`spendUsd * ${rate}`,commission:"commissionIdr",profit:`commissionIdr - spendUsd * ${rate}`,profitPercent:`CASE WHEN spendUsd = 0 THEN NULL ELSE (commissionIdr-spendUsd * ${rate})/(spendUsd * ${rate})*100 END`}[state.sort]);
    const config = Prisma.raw(`${provider}CampaignConfig`),metric = Prisma.raw(`${provider}CampaignDailyMetric`);
    const fk = Prisma.raw(`m.${key}CampaignConfigId`);
    const cte = Prisma.sql`
      WITH scoped AS (SELECT id,shopeeAccountId,historySyncedThrough FROM ${config} WHERE shopeeAccountId IN (${Prisma.join(ids)})),
      coverage AS (SELECT shopeeAccountId,COUNT(*) AS configCount,SUM(CASE WHEN historySyncedThrough IS NULL THEN 1 ELSE 0 END) AS unsynced,MIN(historySyncedThrough) AS earliest FROM scoped GROUP BY shopeeAccountId),
      daily AS (
        SELECT c.shopeeAccountId,m.date,
          CASE WHEN COUNT(m.spendUsd)=(SELECT COUNT(*) FROM scoped s WHERE s.shopeeAccountId=c.shopeeAccountId) THEN SUM(m.spendUsd) ELSE NULL END AS spendUsd,
          CASE WHEN COUNT(m.commissionIdr)=(SELECT COUNT(*) FROM scoped s WHERE s.shopeeAccountId=c.shopeeAccountId) THEN SUM(m.commissionIdr) ELSE NULL END AS commissionIdr
        FROM ${metric} m INNER JOIN scoped c ON c.id=${fk}
        WHERE (${range.from}='' OR m.date>=${range.from}) AND (${range.to}='' OR m.date<=${range.to})
        GROUP BY c.shopeeAccountId,m.date
      ), totals AS (
        SELECT shopeeAccountId,
          SUM(CASE WHEN spendUsd IS NOT NULL AND commissionIdr IS NOT NULL THEN spendUsd ELSE NULL END) AS spendUsd,
          SUM(CASE WHEN spendUsd IS NOT NULL AND commissionIdr IS NOT NULL THEN commissionIdr ELSE NULL END) AS commissionIdr,
          SUM(CASE WHEN spendUsd IS NULL OR commissionIdr IS NULL THEN 1 ELSE 0 END) AS incompleteDays
        FROM daily GROUP BY shopeeAccountId
      )`;
    const [summaries,counts] = await Promise.all([
      db.$queryRaw<(FinancialRow & { configCount: bigint; unsynced: bigint; earliest: Date | string | null; incompleteDays: bigint | null })[]>(Prisma.sql`${cte} SELECT c.*,t.spendUsd,t.commissionIdr,t.incompleteDays FROM coverage c LEFT JOIN totals t ON t.shopeeAccountId=c.shopeeAccountId ORDER BY c.shopeeAccountId`),
      db.$queryRaw<{ total: bigint }[]>(Prisma.sql`${cte} SELECT COUNT(*) AS total FROM daily`),
    ]);
    const total = Number(counts[0].total),pageCount = Math.max(1,Math.ceil(total/state.pageSize)),page = Math.min(state.page,pageCount);
    const rows = await db.$queryRaw<(FinancialRow & { date: Date | string })[]>(Prisma.sql`${cte} SELECT * FROM daily
      ORDER BY (${order}) IS NULL ASC,(${order}) ${Prisma.raw(state.dir === "asc" ? "ASC" : "DESC")},date DESC,shopeeAccountId ASC
      LIMIT ${state.pageSize} OFFSET ${(page-1)*state.pageSize}`);
    const calculate = provider === "Clickadu" ? calculateClickaduDailyFinancials : calculateAdsterraDailyFinancials;
    return { provider,key,total,page,pageCount,state,
      summary: summaries.map((s) => ({ ...financials(s,calculate),configCount: Number(s.configCount),unsynced: Number(s.unsynced),incompleteDays: Number(s.incompleteDays ?? 0),earliest: s.earliest === null ? null : typeof s.earliest === "string" ? s.earliest.slice(0,10) : s.earliest.toISOString().slice(0,10) })),
      rows: rows.map((r) => ({ ...financials(r,calculate),date: typeof r.date === "string" ? r.date.slice(0,10) : r.date.toISOString().slice(0,10) })),
    };
  }));
}
export type GroupTrafficData = Awaited<ReturnType<typeof getGroupTrafficReport>>;
