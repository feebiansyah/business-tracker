import { calculateFinancialMetrics } from "./metrics.ts";

export type SummaryMetric = { date: string; spend: number; commission: number | null };

export function summarizeCampaignMetrics(metrics: SummaryMetric[]) {
  const totalSpend = metrics.reduce((total, metric) => total + metric.spend, 0);
  const commissions = metrics.map((metric) => metric.commission).filter((value): value is number => value !== null);
  const totalCommission = commissions.length > 0 ? commissions.reduce((total, value) => total + value, 0) : null;
  const financial = calculateFinancialMetrics(totalSpend, totalCommission, null, null);
  return { daysWithData: new Set(metrics.map((metric) => metric.date)).size, totalSpend, costWithFee: financial.costWithFee, totalCommission, profit: financial.profit, profitPercent: financial.profitPercent };
}

export type DailyMetricSource = { id: number; date: string; spend: number; commission: number | null; commissionImported: boolean; clickFp: number | null; shopeeClicks: number | null; cpcFp: number | null; note: string | null; completed: boolean };

export function dailyCommissionDisplay(commission: number | null, commissionImported: boolean) {
  if (commission !== null) return commission;
  return commissionImported ? "Rp 0" : "Belum Import";
}

export function isCommissionImportDateCovered(date: string, ranges: readonly { from: string; to: string }[]) {
  return ranges.some((range) => range.from <= date && date <= range.to);
}

export function buildDailyMetricView(metric: DailyMetricSource) {
  const financial = calculateFinancialMetrics(metric.spend, metric.commission, metric.clickFp, metric.shopeeClicks);
  return { ...metric, costWithFee: financial.costWithFee, profit: financial.profit, profitPercent: financial.profitPercent, clickPercent: financial.clickPercent, cpcShopee: financial.cpcShopee };
}
