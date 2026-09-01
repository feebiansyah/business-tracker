import assert from "node:assert/strict";
import test from "node:test";
import { calculatePrafilterValues } from "./calculations.ts";
import { isCampaignStartOnDate } from "./date.ts";
import { campaignMetaUpdate, metricMetaUpdate } from "./upsert-data.ts";
import { normalizeMetaAccountPath } from "../meta/account-id.ts";

test("campaign start +0700 matches its Indonesia operational date", () => {
  assert.equal(isCampaignStartOnDate("2026-08-31T23:30:00+0700", "2026-08-31"), true);
});

test("campaign from the prior operational date does not match", () => {
  assert.equal(isCampaignStartOnDate("2026-08-30T23:30:00+0700", "2026-08-31"), false);
});

test("calculates fee, profit, and profit percentage", () => {
  const result = calculatePrafilterValues(30306, 40000);
  assert.equal(result.costWithFee, 31821.3);
  assert.equal(result.profit, 8178.7);
  assert.ok(result.profitPercent !== null && Math.abs(result.profitPercent - 25.7) < 0.01);
});

test("returns null profit values when commission is null", () => {
  const result = calculatePrafilterValues(30306, null);
  assert.equal(result.profit, null);
  assert.equal(result.profitPercent, null);
});

test("returns null profit percentage when cost with fee is zero", () => {
  const result = calculatePrafilterValues(0, 40000);
  assert.equal(result.profitPercent, null);
});

test("Meta resync update payload excludes manual campaign fields", () => {
  const update = campaignMetaUpdate({ name: "Campaign", startTime: null, metaStatus: "ACTIVE", metaAccountId: 1 });
  assert.equal("jenis" in update, false);
  assert.equal("note" in update, false);
  assert.equal("operationalStatus" in update, false);
});

test("Meta metric resync update payload excludes commission", () => {
  const update = metricMetaUpdate({ spend: 100, clicks: 2, cpc: 50 });
  assert.equal("commission" in update, false);
});

test("normalizes Meta account IDs without duplicating the act_ prefix", () => {
  assert.equal(normalizeMetaAccountPath("123"), "act_123");
  assert.equal(normalizeMetaAccountPath("act_123"), "act_123");
});
