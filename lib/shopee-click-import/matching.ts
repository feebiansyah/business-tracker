import type { CampaignCandidate } from "../shopee-import/types.ts";
import type { ClickAggregate, ClickMatch } from "./types.ts";

export function matchClickAggregates(aggregates: ClickAggregate[], campaigns: CampaignCandidate[]): ClickMatch {
  const byName = new Map<string, CampaignCandidate[]>();
  for (const campaign of campaigns) {
    const key = campaign.name.trim().toUpperCase();
    byName.set(key, [...(byName.get(key) ?? []), campaign]);
  }
  const result: ClickMatch = { matched: [], unmatched: [], matchedClicks: 0, unmatchedClicks: 0 };
  for (const aggregate of aggregates) {
    const candidates = byName.get(aggregate.normalizedTagLink2) ?? [];
    if (candidates.length === 1) {
      result.matched.push({ ...aggregate, campaignId: candidates[0].id });
      result.matchedClicks += aggregate.clickCount;
    } else {
      result.unmatched.push({ ...aggregate, reason: candidates.length ? "AMBIGUOUS_CAMPAIGN_NAME" : "CAMPAIGN_NOT_FOUND" });
      result.unmatchedClicks += aggregate.clickCount;
    }
  }
  return result;
}
