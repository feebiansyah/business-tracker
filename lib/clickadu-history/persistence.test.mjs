import assert from "node:assert/strict";
import test from "node:test";

import { buildDailyMetricUpsert, persistClickaduDailyMetricAndCheckpoint } from "./persistence.ts";

test("upsert uses config and date identity and only updates available API fields", () => {
  const current = buildDailyMetricUpsert({ clickaduCampaignConfigId: 3, date: "2026-09-19", spendUsd: "1.25", dailyBudget: "10" });
  assert.deepEqual(current.where, { clickaduCampaignConfigId_date: { clickaduCampaignConfigId: 3, date: new Date("2026-09-19T00:00:00.000Z") } });
  assert.equal(current.create.spendUsd, "1.25");
  assert.equal(current.create.dailyBudget, "10");
  assert.deepEqual(current.update, { spendUsd: "1.25", dailyBudget: "10" });

  const historicalMissing = buildDailyMetricUpsert({ clickaduCampaignConfigId: 3, date: "2026-09-18", spendUsd: null, dailyBudget: null });
  assert.equal(historicalMissing.create.spendUsd, null);
  assert.equal(historicalMissing.create.dailyBudget, null);
  assert.deepEqual(historicalMissing.update, {});
  assert.equal("commissionIdr" in historicalMissing.update, false);
});

test("metric and checkpoint persist in one transaction without touching commission", async () => {
  const calls = [];
  const db = { $transaction: async (work) => work({
    clickaduCampaignDailyMetric: { upsert: async (args) => { calls.push(["metric", args]); return { id: 1 }; } },
    clickaduCampaignConfig: { updateMany: async (args) => calls.push(["checkpoint", args]) },
  }) };
  await persistClickaduDailyMetricAndCheckpoint(db, { clickaduCampaignConfigId: 3, date: "2026-09-20", spendUsd: "2", dailyBudget: null });
  assert.equal(calls[0][0], "metric");
  assert.equal("commissionIdr" in calls[0][1].update, false);
  const checkpoint = new Date("2026-09-20T00:00:00.000Z");
  assert.deepEqual(calls[1], ["checkpoint", {
    where: { id: 3, OR: [{ historySyncedThrough: null }, { historySyncedThrough: { lt: checkpoint } }] },
    data: { historySyncedThrough: checkpoint },
  }]);
});
