import assert from "node:assert/strict";
import test from "node:test";
import { buildAdsterraDailyMetricUpsert, persistAdsterraDailyMetricAndCheckpoint } from "./persistence.ts";

test("Adsterra spend upsert is config-date scoped and preserves commission", () => {
  const query = buildAdsterraDailyMetricUpsert({ adsterraCampaignConfigId: 3, date: "2026-09-21", spendUsd: "1.25" });
  assert.deepEqual(query.where, { adsterraCampaignConfigId_date: { adsterraCampaignConfigId: 3, date: new Date("2026-09-21T00:00:00Z") } });
  assert.deepEqual(query.update, { spendUsd: "1.25" });
  assert.equal("commissionIdr" in query.update, false);
  assert.deepEqual(buildAdsterraDailyMetricUpsert({ adsterraCampaignConfigId: 3, date: "2026-09-20", spendUsd: null }).update, { spendUsd: null });
});
test("metric and monotonic checkpoint are atomic", async () => {
  const calls = [];
  await persistAdsterraDailyMetricAndCheckpoint({ $transaction: async (work) => work({ adsterraCampaignDailyMetric: { upsert: async (args) => calls.push(["metric", args]) }, adsterraCampaignConfig: { updateMany: async (args) => calls.push(["checkpoint", args]) } }) }, { adsterraCampaignConfigId: 3, date: "2026-09-21", spendUsd: "2" });
  assert.equal(calls[0][0], "metric");
  assert.deepEqual(calls[1][1].data, { historySyncedThrough: new Date("2026-09-21T00:00:00Z") });
  assert.deepEqual(calls[1][1].where.OR, [{ historySyncedThrough: null }, { historySyncedThrough: { lt: new Date("2026-09-21T00:00:00Z") } }]);
});
