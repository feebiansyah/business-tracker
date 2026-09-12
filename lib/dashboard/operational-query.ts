import type { Prisma } from "../generated/prisma/client.ts";
import { buildOperationalDashboard, getJakartaPreviousDate } from "./operational.ts";

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
    },
  });
  return buildOperationalDashboard(accounts.map((account) => ({
    id: account.id,
    name: account.name,
    metaAccounts: account.metaAccounts.map((wl) => ({ spendHistorySyncedThrough: wl.spendHistorySyncedThrough, activeCampaignCount: wl._count.campaigns })),
    commissionCovered: account.commissionImports.length > 0,
    clickCovered: account.clickImports.length > 0,
  })), targetDate);
}
