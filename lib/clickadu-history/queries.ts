import type { PrismaClient } from "../generated/prisma/client.ts";

export type ClickaduHistoryPageSize = 25 | 50 | 100;
export type ClickaduHistoryParams = { page: number; pageSize: ClickaduHistoryPageSize; dir: "asc" | "desc" };
type ClickaduHistoryDb = Pick<PrismaClient, "clickaduCampaignConfig" | "clickaduCampaignDailyMetric">;

export async function getClickaduCampaignList(db: Pick<PrismaClient, "clickaduCampaignConfig">, shopeeAccountId: number) {
  return db.clickaduCampaignConfig.findMany({
    where: { shopeeAccountId },
    select: { id: true, campaignId: true, label: true, sourceTag: true, lastBlacklistReplacedAt: true },
    orderBy: [{ label: "asc" }, { id: "asc" }],
  });
}

export async function getClickaduDailyHistory(
  db: ClickaduHistoryDb,
  shopeeAccountId: number,
  configId: number,
  params: ClickaduHistoryParams,
) {
  if (![shopeeAccountId, configId].every((value) => Number.isSafeInteger(value) && value > 0)) return null;
  const config = await db.clickaduCampaignConfig.findFirst({
    where: { id: configId, shopeeAccountId },
    select: { id: true, campaignId: true, label: true, sourceTag: true },
  });
  if (!config) return null;
  const where = { clickaduCampaignConfigId: config.id };
  const total = await db.clickaduCampaignDailyMetric.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / params.pageSize));
  const page = Math.min(Math.max(1, params.page), pageCount);
  const rows = await db.clickaduCampaignDailyMetric.findMany({
    where,
    select: { id: true, date: true, spendUsd: true, dailyBudget: true, commissionIdr: true },
    orderBy: [{ date: params.dir }, { id: "asc" }],
    skip: (page - 1) * params.pageSize,
    take: params.pageSize,
  });
  return {
    config,
    rows: rows.map((row) => ({
      id: row.id,
      date: row.date.toISOString().slice(0, 10),
      spendUsd: row.spendUsd?.toString() ?? null,
      dailyBudget: row.dailyBudget?.toString() ?? null,
      commissionIdr: row.commissionIdr?.toString() ?? null,
    })),
    pagination: { page, pageSize: params.pageSize, total, pageCount },
    state: { ...params, page },
  };
}

export type ClickaduDailyHistory = NonNullable<Awaited<ReturnType<typeof getClickaduDailyHistory>>>;
