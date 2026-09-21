import assert from "node:assert/strict";
import test from "node:test";
import Decimal from "decimal.js";

import { buildClickaduCommissionUpsertQuery, clickaduMetricDuplicateUpdateColumns } from "./clickadu-persistence.ts";

test("Clickadu commission upsert is config-date scoped and commission-only", () => {
  assert.deepEqual(clickaduMetricDuplicateUpdateColumns, ["commissionIdr", "updatedAt"]);
  const query = buildClickaduCommissionUpsertQuery([{
    clickaduCampaignConfigId: 3, date: "2026-09-18", commission: new Decimal("123.45678"), rowCount: 2,
  }]);
  const sql = query.strings.join(" ");
  assert.match(sql, /ClickaduCampaignDailyMetric/);
  assert.match(sql, /commissionIdr/);
  assert.match(sql, /ON DUPLICATE KEY UPDATE/);
  assert.doesNotMatch(sql, /spendUsd\s*=/);
  assert.doesNotMatch(sql, /dailyBudget\s*=/);
});
