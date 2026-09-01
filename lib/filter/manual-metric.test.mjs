import assert from "node:assert/strict";
import test from "node:test";
import { buildManualMetricUpdate } from "./manual-metric.ts";

test("manual metric update persists an optional note and completion state only", () => {
  assert.deepEqual(buildManualMetricUpdate("  follow up besok  ", true), { note: "follow up besok", completed: true });
  assert.deepEqual(buildManualMetricUpdate("   ", false), { note: null, completed: false });
});

test("manual metric note is bounded before persistence", () => {
  assert.equal(buildManualMetricUpdate("x".repeat(2100), false).note?.length, 2000);
});
