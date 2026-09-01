import assert from "node:assert/strict";
import test from "node:test";
import { adSetsRequest, campaignsRequest, campaignInsightsRequest } from "./campaign-requests.ts";

test("campaign metadata request uses the normalized account edge and narrow fields", () => {
  assert.deepEqual(campaignsRequest("act_123"), {
    path: "/act_123/campaigns",
    fields: ["id", "name", "status", "effective_status", "start_time", "daily_budget", "lifetime_budget"],
  });
});

test("ad-set metadata request stays account-level", () => {
  assert.deepEqual(adSetsRequest("123"), {
    path: "/act_123/adsets",
    fields: ["id", "campaign_id", "status", "effective_status", "daily_budget", "lifetime_budget"],
  });
});

test("insight request is daily and account-level for one bounded range", () => {
  assert.deepEqual(campaignInsightsRequest("123", { since: "2026-08-01", until: "2026-08-31" }), {
    path: "/act_123/insights",
    fields: ["campaign_id", "campaign_name", "spend", "clicks", "cpc", "date_start", "date_stop"],
    params: { level: "campaign", time_increment: "1", time_range: '{"since":"2026-08-01","until":"2026-08-31"}' },
  });
});
