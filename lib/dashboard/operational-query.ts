import type { Prisma } from "../generated/prisma/client.ts";
import { buildOperationalDashboard, getJakartaPreviousDate } from "./operational.ts";

type OperationalDb = Pick<Prisma.TransactionClient, "shopeeAccount" | "$queryRaw">;

export async function getOperationalDashboard(now: Date, db: OperationalDb) {
  const targetDate = getJakartaPreviousDate(now);
  const target = new Date(`${targetDate}T00:00:00.000Z`);
  const [accounts, noteCounts] = await Promise.all([db.shopeeAccount.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      metaAccounts: {
        select: {
          spendHistorySyncedThrough: true,
          status: true,
          _count: { select: { campaigns: { where: { metaStatus: "ACTIVE" } } } },
        },
      },
      commissionImports: {
        where: { dateFrom: { lte: target }, dateTo: { gte: target } },
        select: { id: true },
        take: 1,
      },
      clickImports: {
        where: { dateFrom: { lte: target }, dateTo: { gte: target } },
        select: { id: true },
        take: 1,
      },
      clickaduCampaignConfigs: {
        select: { lastBlacklistReplacedAt: true },
      },
      adsterraCampaignConfigs: {
        select: { id: true, campaignId: true, label: true, lastBlacklistReplacedAt: true },
      },
    },
  }), db.$queryRaw<{ shopeeAccountId: number; count: bigint | number }[]>`
    SELECT ma.shopeeAccountId, COUNT(*) AS count
    FROM CampaignDailyMetric dm
    INNER JOIN Campaign c ON c.id = dm.campaignId
    INNER JOIN MetaAccount ma ON ma.id = c.metaAccountId
    WHERE ma.shopeeAccountId IS NOT NULL
      AND dm.completed = false AND dm.note IS NOT NULL AND TRIM(dm.note) <> ''
    GROUP BY ma.shopeeAccountId
  `]);
  const pendingNotes = new Map(noteCounts.map((row) => [row.shopeeAccountId, Number(row.count)]));
  const dashboard = buildOperationalDashboard(accounts.map((account) => ({
    id: account.id,
    name: account.name,
    metaAccounts: account.metaAccounts.map((wl) => ({ status: wl.status, spendHistorySyncedThrough: wl.spendHistorySyncedThrough, activeCampaignCount: wl._count.campaigns })),
    commissionCovered: account.commissionImports.length > 0,
    clickCovered: account.clickImports.length > 0,
    pendingNoteCount: pendingNotes.get(account.id) ?? 0,
    clickaduCampaignConfigs: account.clickaduCampaignConfigs,
    adsterraCampaignConfigs: account.adsterraCampaignConfigs,
  })), targetDate);
  return {
    ...dashboard,
    accounts: dashboard.accounts.map((account, index) => ({
      ...account,
      adsterraCampaigns: accounts[index].adsterraCampaignConfigs.map(({ id, campaignId, label }) => ({ id, campaignId, label })),
    })),
  };
}
