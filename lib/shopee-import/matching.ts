import Decimal from "decimal.js";
import type {
  CampaignCandidate,
  CommissionAggregate,
  MatchResult,
} from "./types.ts";

export function matchCommissionAggregates(
  aggregates: CommissionAggregate[],
  campaigns: CampaignCandidate[],
): MatchResult {
  const campaignsByName = new Map<string, CampaignCandidate[]>();
  for (const campaign of campaigns) {
    const normalizedName = campaign.name.trim().toUpperCase();
    const candidates = campaignsByName.get(normalizedName) ?? [];
    candidates.push(campaign);
    campaignsByName.set(normalizedName, candidates);
  }

  const result: MatchResult = {
    matched: [],
    unmatched: [],
    matchedCommission: new Decimal(0),
    unmatchedCommission: new Decimal(0),
  };

  for (const aggregate of aggregates) {
    const candidates = campaignsByName.get(aggregate.normalizedTagLink2) ?? [];
    if (candidates.length === 1) {
      result.matched.push({ ...aggregate, campaignId: candidates[0].id });
      result.matchedCommission = result.matchedCommission.plus(aggregate.commission);
      continue;
    }

    result.unmatched.push({
      ...aggregate,
      reason: candidates.length === 0 ? "CAMPAIGN_NOT_FOUND" : "AMBIGUOUS_CAMPAIGN_NAME",
    });
    result.unmatchedCommission = result.unmatchedCommission.plus(aggregate.commission);
  }

  return result;
}
