import "server-only";

import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { buildDailyMetricView, type DailyMetricSource } from "@/lib/filter/view-model";
import type { FilterParams, FilterSortKey, HistoryParams, HistorySortKey } from "@/lib/filter/server-pagination";

export type FilterCampaignRow = { id: number; name: string; wlName: string; budget: number; days: number; totalSpend: number; costWithFee: number; totalCommission: number | null; profit: number | null; profitPercent: number | null };
export type PageInfo = { page: number; pageSize: 25 | 50 | 100; total: number; pageCount: number };
export type FilterPageData = { shopeeAccount: { id: number; name: string }; unresolvedBudgets: number; campaigns: FilterCampaignRow[]; pagination: PageInfo };

function dateString(date: Date) { return date.toISOString().slice(0, 10); }
function numberValue(value: Prisma.Decimal | bigint | number | null) { return value === null ? null : Number(value); }
function pageInfo(total: number, requestedPage: number, pageSize: 25 | 50 | 100): PageInfo { const pageCount = Math.max(1, Math.ceil(total / pageSize)); return { page: Math.min(requestedPage, pageCount), pageSize, total, pageCount }; }

const filterOrderColumns: Record<FilterSortKey, string> = {
  name: "summary.name", wlName: "summary.wlName", budget: "summary.budget", days: "summary.days", totalSpend: "summary.totalSpend",
  costWithFee: "summary.costWithFee", totalCommission: "summary.totalCommission", profit: "summary.profit", profitPercent: "summary.profitPercent",
};
type FilterSqlRow = { id: number; name: string; wlName: string; budget: Prisma.Decimal; days: bigint; totalSpend: Prisma.Decimal; costWithFee: Prisma.Decimal; totalCommission: Prisma.Decimal | null; profit: Prisma.Decimal | null; profitPercent: Prisma.Decimal | null };

export async function getFilterPageData(shopeeAccountId: number, params: FilterParams): Promise<FilterPageData | null> {
  if (!Number.isInteger(shopeeAccountId) || shopeeAccountId <= 0) return null;
  const shopeeAccount = await prisma.shopeeAccount.findUnique({ where: { id: shopeeAccountId }, select: { id: true, name: true } });
  if (!shopeeAccount) return null;
  const scope = { metaAccount: { shopeeAccountId } };
  const where = { ...scope, metaStatus: "ACTIVE", effectiveDailyBudget: { not: null, lt: 200000 }, ...(params.q ? { name: { contains: params.q } } : {}) } as const;
  const [unresolvedBudgets, total] = await Promise.all([
    prisma.campaign.count({ where: { ...scope, effectiveDailyBudget: null } }),
    prisma.campaign.count({ where }),
  ]);
  const pagination = pageInfo(total, params.page, params.pageSize);
  const orderColumn = Prisma.raw(filterOrderColumns[params.sort]);
  const orderDirection = Prisma.raw(params.dir === "asc" ? "ASC" : "DESC");
  const rows = await prisma.$queryRaw<FilterSqlRow[]>(Prisma.sql`
    SELECT summary.* FROM (
      SELECT c.id, c.name, ma.name AS wlName, c.effectiveDailyBudget AS budget,
        COUNT(DISTINCT dm.date) AS days,
        COALESCE(SUM(COALESCE(dm.spend, 0)), 0) AS totalSpend,
        COALESCE(SUM(COALESCE(dm.spend, 0)), 0) * 1.05 AS costWithFee,
        CASE WHEN COUNT(dm.commission) > 0 THEN SUM(dm.commission) ELSE NULL END AS totalCommission,
        CASE WHEN COUNT(dm.commission) > 0 THEN SUM(dm.commission) - COALESCE(SUM(COALESCE(dm.spend, 0)), 0) * 1.05 ELSE NULL END AS profit,
        CASE WHEN COUNT(dm.commission) > 0 AND COALESCE(SUM(COALESCE(dm.spend, 0)), 0) <> 0 THEN (SUM(dm.commission) - COALESCE(SUM(COALESCE(dm.spend, 0)), 0) * 1.05) / (COALESCE(SUM(COALESCE(dm.spend, 0)), 0) * 1.05) * 100 ELSE NULL END AS profitPercent
      FROM Campaign c
      INNER JOIN MetaAccount ma ON ma.id = c.metaAccountId
      LEFT JOIN CampaignDailyMetric dm ON dm.campaignId = c.id
        AND (${params.from} = '' OR dm.date >= ${params.from})
        AND (${params.to} = '' OR dm.date <= ${params.to})
      WHERE ma.shopeeAccountId = ${shopeeAccountId} AND c.metaStatus = 'ACTIVE' AND c.effectiveDailyBudget IS NOT NULL AND c.effectiveDailyBudget < 200000
        AND (${params.q} = '' OR LOCATE(${params.q}, c.name) > 0)
      GROUP BY c.id, c.name, ma.name, c.effectiveDailyBudget
    ) summary
    ORDER BY ${orderColumn} IS NULL ASC, ${orderColumn} ${orderDirection}, summary.id ASC
    LIMIT ${pagination.pageSize} OFFSET ${(pagination.page - 1) * pagination.pageSize}
  `);
  return { shopeeAccount, unresolvedBudgets, pagination, campaigns: rows.map((row) => ({
    id: row.id, name: row.name, wlName: row.wlName, budget: Number(row.budget), days: Number(row.days), totalSpend: Number(row.totalSpend),
    costWithFee: Number(row.costWithFee), totalCommission: numberValue(row.totalCommission), profit: numberValue(row.profit), profitPercent: numberValue(row.profitPercent),
  })) };
}

export type FilterCampaignDetail = {
  campaign: { id: number; name: string; wlName: string; budget: number; status: string; startDate: string | null; totalSpend: number };
  dailyMetrics: ReturnType<typeof buildDailyMetricView>[];
  pagination: PageInfo;
  state: HistoryParams;
};
const historyOrderColumns: Record<HistorySortKey, string> = {
  date: "metric.date", spend: "metric.spendValue", costWithFee: "metric.costWithFee", commission: "metric.commission", profit: "metric.profit",
  profitPercent: "metric.profitPercent", clickFp: "metric.clickFp", shopeeClicks: "metric.shopeeClicks", clickPercent: "metric.clickPercent",
  cpcFp: "metric.cpcFp", cpcShopee: "metric.cpcShopee", note: "metric.note", completed: "metric.completed",
};
type HistorySqlRow = { id: number; date: Date; spendValue: Prisma.Decimal; commission: Prisma.Decimal | null; clickFp: number | null; shopeeClicks: number | null; cpcFp: Prisma.Decimal | null; note: string | null; completed: boolean };

export async function getFilterCampaignDetail(shopeeAccountId: number, campaignId: number, params: HistoryParams): Promise<FilterCampaignDetail | null> {
  if (!Number.isInteger(shopeeAccountId) || shopeeAccountId <= 0 || !Number.isInteger(campaignId) || campaignId <= 0) return null;
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, metaStatus: "ACTIVE", effectiveDailyBudget: { not: null, lt: 200000 }, metaAccount: { shopeeAccountId } },
    select: { id: true, name: true, metaStatus: true, startTime: true, effectiveDailyBudget: true, metaAccount: { select: { name: true } } },
  });
  if (!campaign) return null;
  const [total, spendAggregate, commissionImports] = await Promise.all([
    prisma.campaignDailyMetric.count({ where: { campaignId } }),
    prisma.campaignDailyMetric.aggregate({ where: { campaignId }, _sum: { spend: true } }),
    prisma.shopeeCommissionImport.findMany({ where: { shopeeAccountId }, select: { dateFrom: true, dateTo: true } }),
  ]);
  const pagination = pageInfo(total, params.page, params.pageSize);
  const orderColumn = Prisma.raw(historyOrderColumns[params.sort]);
  const orderDirection = Prisma.raw(params.dir === "asc" ? "ASC" : "DESC");
  const rows = await prisma.$queryRaw<HistorySqlRow[]>(Prisma.sql`
    SELECT metric.id, metric.date, metric.spendValue, metric.commission, metric.clickFp, metric.shopeeClicks, metric.cpcFp, metric.note, metric.completed
    FROM (
      SELECT dm.id, dm.date, COALESCE(dm.spend, 0) AS spendValue, dm.commission, dm.clickFp, dm.shopeeClicks, dm.cpcFp, dm.note, dm.completed,
        COALESCE(dm.spend, 0) * 1.05 AS costWithFee,
        CASE WHEN dm.commission IS NULL THEN NULL ELSE dm.commission - COALESCE(dm.spend, 0) * 1.05 END AS profit,
        CASE WHEN dm.commission IS NULL OR COALESCE(dm.spend, 0) = 0 THEN NULL ELSE (dm.commission - COALESCE(dm.spend, 0) * 1.05) / (COALESCE(dm.spend, 0) * 1.05) * 100 END AS profitPercent,
        CASE WHEN dm.shopeeClicks IS NULL OR dm.clickFp IS NULL OR dm.clickFp = 0 THEN NULL ELSE dm.shopeeClicks / dm.clickFp * 100 END AS clickPercent,
        CASE WHEN dm.shopeeClicks IS NULL OR dm.shopeeClicks = 0 THEN NULL ELSE COALESCE(dm.spend, 0) / dm.shopeeClicks END AS cpcShopee
      FROM CampaignDailyMetric dm WHERE dm.campaignId = ${campaignId}
    ) metric
    ORDER BY ${orderColumn} IS NULL ASC, ${orderColumn} ${orderDirection}, metric.id ASC
    LIMIT ${pagination.pageSize} OFFSET ${(pagination.page - 1) * pagination.pageSize}
  `);
  const importedRanges = commissionImports.map((item) => ({ from: dateString(item.dateFrom), to: dateString(item.dateTo) }));
  const sources: DailyMetricSource[] = rows.map((metric) => ({
    id: metric.id, date: dateString(metric.date), spend: Number(metric.spendValue), commission: numberValue(metric.commission),
    commissionImported: importedRanges.some((range) => range.from <= dateString(metric.date) && dateString(metric.date) <= range.to),
    clickFp: metric.clickFp, shopeeClicks: metric.shopeeClicks, cpcFp: numberValue(metric.cpcFp), note: metric.note, completed: Boolean(metric.completed),
  }));
  return {
    campaign: { id: campaign.id, name: campaign.name, wlName: campaign.metaAccount.name, budget: Number(campaign.effectiveDailyBudget), status: campaign.metaStatus!, startDate: campaign.startTime ? dateString(campaign.startTime) : null, totalSpend: Number(spendAggregate._sum.spend ?? 0) },
    dailyMetrics: sources.map(buildDailyMetricView), pagination, state: { ...params, page: pagination.page },
  };
}
