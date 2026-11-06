import { buildMonthlyChunks, getAccountSpendHistoryStart } from "./date-ranges.ts";
import { planCampaignCoverage, type CoverageChunk } from "./sync-planning.ts";
import { isHistorySyncCampaign, resolveEffectiveDailyBudget } from "./rules";
import type { MetaCampaign, MetaAdSet } from "@/lib/meta/types";
import type { CampaignMetadataInput } from "./persistence";
import type { MetaSyncPhase } from "./meta-sync-state";

export const syncDate = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
export function inactiveThroughDate(today: string) {
  const date = new Date(today + "T00:00:00Z"); date.setUTCDate(date.getUTCDate()-1); return date.toISOString().slice(0,10);
}
export type SyncCampaignCoverage = { id: number; metaCampaignId: string; startDate: string | null; historySyncedThrough: string | null; metaStatus: string | null; effectiveDailyBudget: number | null };
export type SyncCoverage = { spend: { since: string; until: string }[]; insights: CoverageChunk[]; campaigns: { id: number; metaCampaignId: string }[]; missingStartDates: number };
export type SyncCursor = {
  inactive?: boolean; step?: "CAMPAIGNS" | "ADSETS" | "PERSIST" | "PLAN";
  after?: string; seen?: string[]; campaigns?: MetaCampaign[]; adSets?: MetaAdSet[]; offset?: number;
  coverage?: SyncCoverage; rangeIndex?: number; spendCheckpoint?: string | null;
  knownCampaigns?: SyncCampaignCoverage[]; persisted?: SyncCampaignCoverage[];
};
export type MetaSyncWorkUnit = { kind: "STATUS" | "METADATA" | "DONE" | "ADVANCE" } | { kind: "ACCOUNT_SPEND" | "CAMPAIGN_INSIGHTS"; range: { since: string; until: string }; campaignIds?: number[] };

export function campaignSyncMetadata(campaign: MetaCampaign, adSets: MetaAdSet[], metaAccountId: number): CampaignMetadataInput {
  const budget = resolveEffectiveDailyBudget(campaign, adSets);
  const parsed = campaign.start_time ? new Date(campaign.start_time) : null;
  return { metaCampaignId: campaign.id, name: campaign.name, metaAccountId, startTime: parsed && !Number.isNaN(+parsed) ? parsed : null, metaStatus: campaign.status ?? null, effectiveStatus: campaign.effective_status ?? null, effectiveDailyBudget: budget.amount, budgetSource: budget.source };
}

export function buildMetaSyncCoverage(input: { inactive: boolean; spendCheckpoint: string | null; campaigns: SyncCampaignCoverage[] }, targetDate: string): SyncCoverage {
  const through = input.inactive ? inactiveThroughDate(targetDate) : targetDate;
  const earliestStart = input.campaigns.reduce<string | null>((earliest,c) => c.startDate && (!earliest || c.startDate < earliest) ? c.startDate : earliest, null);
  const since = getAccountSpendHistoryStart({ earliestStart, spendHistorySyncedThrough: input.spendCheckpoint, today: targetDate });
  const eligible = input.campaigns.filter(c => input.inactive ? !c.startDate || c.startDate <= through : isHistorySyncCampaign({ status: c.metaStatus, effectiveDailyBudget: c.effectiveDailyBudget }));
  const coverage = planCampaignCoverage(eligible, targetDate);
  return {
    spend: buildMonthlyChunks(input.inactive && since > through ? through : since, through),
    insights: coverage.chunks.filter(c => c.since <= through).map(c => ({ ...c, until: c.until > through ? through : c.until })),
    campaigns: eligible.map(({ id, metaCampaignId }) => ({ id, metaCampaignId })),
    missingStartDates: coverage.missingStartCampaignIds.length,
  };
}

export function planNextMetaSyncUnit(progress: { phase: string; cursor: SyncCursor }): MetaSyncWorkUnit {
  if (progress.phase === "ACCOUNT_SPEND" || progress.phase === "CAMPAIGN_INSIGHTS") {
    const range = (progress.phase === "ACCOUNT_SPEND" ? progress.cursor.coverage?.spend : progress.cursor.coverage?.insights)?.[progress.cursor.rangeIndex ?? 0];
    const campaignIds = progress.phase === "CAMPAIGN_INSIGHTS" ? progress.cursor.coverage?.insights[progress.cursor.rangeIndex ?? 0]?.campaignIds : undefined;
    return range ? { kind: progress.phase, range: { since: range.since, until: range.until }, ...(campaignIds ? { campaignIds } : {}) } : { kind: "ADVANCE" };
  }
  return { kind: progress.phase as Extract<MetaSyncPhase, "STATUS" | "METADATA" | "DONE"> };
}
