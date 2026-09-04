import assert from "node:assert/strict";
import test from "node:test";
import { calculateDashboardFinancials, summarizeDashboardDays } from "./calculations.ts";

test("dashboard financials preserve unavailable budget and calculate complete values", () => {
  assert.deepEqual(calculateDashboardFinancials(null, 500000), { budget: null, costWithFee: null, commission: 500000, profit: null, profitPercent: null });
  const complete = calculateDashboardFinancials(500000, 700000);
  assert.deepEqual({ ...complete, profitPercent: undefined }, { budget: 500000, costWithFee: 525000, commission: 700000, profit: 175000, profitPercent: undefined });
  assert.ok(Math.abs(complete.profitPercent - 33.33333333333333) < 1e-12);
  assert.deepEqual(calculateDashboardFinancials(0, 10), { budget: 0, costWithFee: 0, commission: 10, profit: 10, profitPercent: null });
});

test("summary is independent of page and becomes unavailable when any historical budget is unknown", () => {
  const allDays = [calculateDashboardFinancials(100, 200), calculateDashboardFinancials(200, 400)];
  assert.deepEqual(summarizeDashboardDays(allDays), calculateDashboardFinancials(300, 600));
  assert.equal(summarizeDashboardDays([allDays[0], calculateDashboardFinancials(null, 50)]).budget, null);
  assert.equal(summarizeDashboardDays([calculateDashboardFinancials(100, null)]).commission, null);
  assert.deepEqual(summarizeDashboardDays([]), calculateDashboardFinancials(null, null));
});
