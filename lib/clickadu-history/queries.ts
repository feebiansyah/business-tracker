import { Prisma, type PrismaClient } from "../generated/prisma/client.ts";
import { calculateClickaduDailyFinancials } from "./financials.ts";
import type { ClickaduHistoryParams, ClickaduHistorySortKey } from "./server-pagination.ts";

type ClickaduHistoryDb = Pick<PrismaClient, "clickaduCampaignConfig" | "clickaduCampaignDailyMetric" | "$queryRaw">;
type HistorySqlRow = { id: number; date: Date; spendUsd: Prisma.Decimal | null; commissionIdr: Prisma.Decimal | null };

const historyOrderColumns: Record<ClickaduHistorySortKey, string> = {
  date: "metric.date",
  spendUsd: "metric.spendUsd",
  spendIdr: "metric.spendUsd * 19000",
  commission: "metric.commissionIdr",
  profit: "metric.commissionIdr - metric.spendUsd * 19000",
};

export async function getClickaduDailySyncConfigs(db: Pick<PrismaClient, "clickaduCampaignConfig">, shopeeAccountId: number) {
  const configs = await db.clickaduCampaignConfig.findMany({
    where: { shopeeAccountId },
    select: { id: true, campaignId: true, historySyncedThrough: true, dailyMetrics: { select: { date: true }, orderBy: { date: "desc" }, take: 1 } },
    orderBy: { id: "asc" },
  });
  return configs.map((config) => ({
    id: config.id,
    campaignId: config.campaignId,
    historySyncedThrough: config.historySyncedThrough?.toISOString().slice(0, 10) ?? null,
    latestMetricDate: config.dailyMetrics[0]?.date.toISOString().slice(0, 10) ?? null,
  }));
}

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
  const orderColumn = Prisma.raw(historyOrderColumns[params.sort]);
  const orderDirection = Prisma.raw(params.dir === "asc" ? "ASC" : "DESC");
  const rows = await db.$queryRaw<HistorySqlRow[]>(Prisma.sql`
    SELECT metric.id, metric.date, metric.spendUsd, metric.commissionIdr
    FROM ClickaduCampaignDailyMetric metric
    WHERE metric.clickaduCampaignConfigId = ${config.id}
    ORDER BY ${orderColumn} IS NULL ASC, ${orderColumn} ${orderDirection}, metric.date DESC, metric.id ASC
    LIMIT ${params.pageSize} OFFSET ${(page - 1) * params.pageSize}
  `);
  return {
    config,
    rows: rows.map((row) => ({
      id: row.id,
      date: row.date.toISOString().slice(0, 10),
      spendUsd: row.spendUsd?.toString() ?? null,
      commissionIdr: row.commissionIdr?.toString() ?? null,
      ...calculateClickaduDailyFinancials(row.spendUsd?.toString() ?? null, row.commissionIdr?.toString() ?? null),
    })),
    pagination: { page, pageSize: params.pageSize, total, pageCount },
    state: { ...params, page },
  };
}

export type ClickaduDailyHistory = NonNullable<Awaited<ReturnType<typeof getClickaduDailyHistory>>>;
