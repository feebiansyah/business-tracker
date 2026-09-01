import "server-only";

import { prisma } from "@/lib/prisma";
import { buildDailyMetricView, summarizeCampaignMetrics, type DailyMetricSource } from "@/lib/filter/view-model";

export type FilterCampaignRow = { id: number; name: string; wlName: string; budget: number; days: number; totalSpend: number; costWithFee: number; totalCommission: number | null; profit: number | null; profitPercent: number | null };
export type FilterPageData = { shopeeAccount: { id: number; name: string }; unresolvedBudgets: number; campaigns: FilterCampaignRow[] };

function dateString(date: Date) { return date.toISOString().slice(0, 10); }

export async function getFilterPageData(shopeeAccountId: number, search: string): Promise<FilterPageData | null> {
  if (!Number.isInteger(shopeeAccountId) || shopeeAccountId <= 0) return null;
  const shopeeAccount = await prisma.shopeeAccount.findUnique({ where: { id: shopeeAccountId }, select: { id: true, name: true } });
  if (!shopeeAccount) return null;
  const scope = { metaAccount: { shopeeAccountId } };
  const [unresolvedBudgets, campaigns] = await Promise.all([
    prisma.campaign.count({ where: { ...scope, effectiveDailyBudget: null } }),
    prisma.campaign.findMany({
      where: { ...scope, metaStatus: "ACTIVE", effectiveDailyBudget: { not: null, lt: 200000 }, ...(search ? { name: { contains: search } } : {}) },
      select: { id: true, name: true, effectiveDailyBudget: true, metaAccount: { select: { name: true } }, dailyMetrics: { select: { date: true, spend: true, commission: true }, orderBy: { date: "asc" } } },
      orderBy: { name: "asc" },
    }),
  ]);
  return { shopeeAccount, unresolvedBudgets, campaigns: campaigns.map((campaign) => {
    const summary = summarizeCampaignMetrics(campaign.dailyMetrics.map((metric) => ({ date: dateString(metric.date), spend: metric.spend?.toNumber() ?? 0, commission: metric.commission?.toNumber() ?? null })));
    return { id: campaign.id, name: campaign.name, wlName: campaign.metaAccount.name, budget: campaign.effectiveDailyBudget!.toNumber(), days: summary.daysWithData, totalSpend: summary.totalSpend, costWithFee: summary.costWithFee, totalCommission: summary.totalCommission, profit: summary.profit, profitPercent: summary.profitPercent };
  }) };
}

export type FilterCampaignDetail = {
  campaign: { id: number; name: string; wlName: string; budget: number; status: string; startDate: string | null; totalSpend: number };
  dailyMetrics: ReturnType<typeof buildDailyMetricView>[];
};

export async function getFilterCampaignDetail(shopeeAccountId: number, campaignId: number): Promise<FilterCampaignDetail | null> {
  if (!Number.isInteger(shopeeAccountId) || shopeeAccountId <= 0 || !Number.isInteger(campaignId) || campaignId <= 0) return null;
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, metaStatus: "ACTIVE", effectiveDailyBudget: { not: null, lt: 200000 }, metaAccount: { shopeeAccountId } },
    select: {
      id: true, name: true, metaStatus: true, startTime: true, effectiveDailyBudget: true,
      metaAccount: { select: { name: true } },
      dailyMetrics: { select: { date: true, spend: true, commission: true, clickFp: true, shopeeClicks: true, cpcFp: true }, orderBy: { date: "desc" } },
    },
  });
  if (!campaign) return null;
  const sources: DailyMetricSource[] = campaign.dailyMetrics.map((metric) => ({
    date: dateString(metric.date), spend: metric.spend?.toNumber() ?? 0, commission: metric.commission?.toNumber() ?? null,
    clickFp: metric.clickFp, shopeeClicks: metric.shopeeClicks, cpcFp: metric.cpcFp?.toNumber() ?? null,
  }));
  return {
    campaign: {
      id: campaign.id, name: campaign.name, wlName: campaign.metaAccount.name,
      budget: campaign.effectiveDailyBudget!.toNumber(), status: campaign.metaStatus!,
      startDate: campaign.startTime ? dateString(campaign.startTime) : null,
      totalSpend: sources.reduce((total, metric) => total + metric.spend, 0),
    },
    dailyMetrics: sources.map(buildDailyMetricView),
  };
}
