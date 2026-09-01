import type { BudgetSource, DailyBudgetRecord } from "./types";

function parseBudget(value: string | null | undefined) {
  if (value === null || value === undefined || value.trim() === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function resolveEffectiveDailyBudget(campaign: DailyBudgetRecord, adSets: DailyBudgetRecord[]): { amount: number | null; source: BudgetSource } {
  const campaignBudget = parseBudget(campaign.daily_budget);
  if (campaignBudget !== null) return { amount: campaignBudget, source: "CAMPAIGN" };

  const adSetBudgets = adSets.map((adSet) => parseBudget(adSet.daily_budget)).filter((amount): amount is number => amount !== null);
  if (adSetBudgets.length > 0) return { amount: adSetBudgets.reduce((total, amount) => total + amount, 0), source: "ADSET" };

  return { amount: null, source: "UNRESOLVED" };
}

export function isFilterCampaign(campaign: { status: string | null | undefined; effectiveDailyBudget: number | null }) {
  return campaign.status === "ACTIVE" && campaign.effectiveDailyBudget !== null && campaign.effectiveDailyBudget < 200000;
}
