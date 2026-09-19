import assert from "node:assert/strict";
import test from "node:test";

import { buildDailyMetricUpsert } from "./persistence.ts";

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
});
