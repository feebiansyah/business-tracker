import { calculateFinancialMetrics } from "./metrics.ts";

export type SummaryMetric = { date: string; spend: number; commission: number | null };

export function summarizeCampaignMetrics(metrics: SummaryMetric[]) {
  const totalSpend = metrics.reduce((total, metric) => total + metric.spend, 0);
  const commissions = metrics.map((metric) => metric.commission).filter((value): value is number => value !== null);
  const totalCommission = commissions.length > 0 ? commissions.reduce((total, value) => total + value, 0) : null;
  const financial = calculateFinancialMetrics(totalSpend, totalCommission, null, null);
  return { daysWithData: new Set(metrics.map((metric) => metric.date)).size, totalSpend, costWithFee: financial.costWithFee, totalCommission, profit: financial.profit, profitPercent: financial.profitPercent };
}
