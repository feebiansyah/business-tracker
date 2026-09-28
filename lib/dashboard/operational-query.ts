import type { Prisma } from "../generated/prisma/client.ts";
import { buildOperationalDashboard, getJakartaDate, getJakartaPreviousDate } from "./operational.ts";

type OperationalDb = Pick<Prisma.TransactionClient, "shopeeAccount">;

export async function getOperationalDashboard(now: Date, db: OperationalDb) {
  const targetDate = getJakartaPreviousDate(now);
  const target = new Date(`${targetDate}T00:00:00.000Z`);
  const accounts = await db.shopeeAccount.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      metaAccounts: {
        select: {
          spendHistorySyncedThrough: true,
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
  });
  const dashboard = buildOperationalDashboard(accounts.map((account) => ({
    id: account.id,
    name: account.name,
    metaAccounts: account.metaAccounts.map((wl) => ({ spendHistorySyncedThrough: wl.spendHistorySyncedThrough, activeCampaignCount: wl._count.campaigns })),
    commissionCovered: account.commissionImports.length > 0,
    clickCovered: account.clickImports.length > 0,
    clickaduCampaignConfigs: account.clickaduCampaignConfigs,
    adsterraCampaignConfigs: account.adsterraCampaignConfigs,
  })), targetDate, getJakartaDate(now));
  return {
    ...dashboard,
    accounts: dashboard.accounts.map((account, index) => ({
      ...account,
      adsterraCampaigns: accounts[index].adsterraCampaignConfigs.map(({ id, campaignId, label }) => ({ id, campaignId, label })),
    })),
  };
}
