import assert from "node:assert/strict";
import test from "node:test";
import { checkpointUpdatesForSuccessfulChunk, planCampaignCoverage } from "./sync-planning.ts";

test("campaigns sharing a range use one account-level chunk", () => {
  const result = planCampaignCoverage([
    { id: 1, startDate: "2026-08-01", historySyncedThrough: null },
    { id: 2, startDate: "2026-08-01", historySyncedThrough: null },
  ], "2026-08-31");
  assert.deepEqual(result.chunks, [{ since: "2026-08-01", until: "2026-08-31", campaignIds: [1, 2] }]);
});

test("different campaign starts in one month still use one account-level request", () => {
  const result = planCampaignCoverage([
    { id: 1, startDate: "2026-08-01", historySyncedThrough: null },
    { id: 2, startDate: "2026-08-15", historySyncedThrough: null },
  ], "2026-08-31");
  assert.deepEqual(result.chunks, [{ since: "2026-08-01", until: "2026-08-31", campaignIds: [1, 2] }]);
});

test("successful empty insight chunk still advances persistent coverage", () => {
  const chunk = { since: "2026-08-01", until: "2026-08-31", campaignIds: [1, 2] };
  assert.deepEqual(checkpointUpdatesForSuccessfulChunk(chunk, []), [
    { campaignId: 1, historySyncedThrough: "2026-08-31" },
    { campaignId: 2, historySyncedThrough: "2026-08-31" },
  ]);
});

test("checkpoint advancement does not depend on which campaigns returned rows", () => {
  const chunk = { since: "2026-08-01", until: "2026-08-31", campaignIds: [1, 2] };
  assert.deepEqual(checkpointUpdatesForSuccessfulChunk(chunk, [{ campaign_id: "meta-1" }]).map((item) => item.campaignId), [1, 2]);
});

test("campaign without start and checkpoint is reported instead of requested", () => {
  const result = planCampaignCoverage([{ id: 7, startDate: null, historySyncedThrough: null }], "2026-09-01");
  assert.deepEqual(result.chunks, []);
  assert.deepEqual(result.missingStartCampaignIds, [7]);
});
