import { normalizeMetaAccountPath } from "./account-id.ts";
import type { MetaInsightRange } from "./types.ts";

export function campaignsRequest(accountId: string) {
  return {
    path: `/${normalizeMetaAccountPath(accountId)}/campaigns`,
    fields: ["id", "name", "status", "effective_status", "start_time", "daily_budget", "lifetime_budget"],
  };
}

export function adSetsRequest(accountId: string) {
  return {
    path: `/${normalizeMetaAccountPath(accountId)}/adsets`,
    fields: ["id", "campaign_id", "status", "effective_status", "daily_budget", "lifetime_budget"],
  };
}

export function campaignInsightsRequest(accountId: string, range: MetaInsightRange) {
  return {
    path: `/${normalizeMetaAccountPath(accountId)}/insights`,
    fields: ["campaign_id", "campaign_name", "spend", "clicks", "cpc", "date_start", "date_stop"],
    params: { level: "campaign", time_increment: "1", time_range: JSON.stringify(range) },
  };
}

export function accountDailySpendRequest(accountId: string, range: MetaInsightRange) {
  return {
    path: `/${normalizeMetaAccountPath(accountId)}/insights`,
    fields: ["spend", "date_start", "date_stop"],
    params: { level: "account", time_increment: "1", time_range: JSON.stringify(range) },
  };
}
