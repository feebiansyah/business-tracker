import assert from "node:assert/strict";
import test from "node:test";
import { calculateFinancialMetrics, dailyMetricMetaUpdate } from "./metrics.ts";

test("missing Shopee data keeps Shopee-derived metrics null", () => {
  assert.deepEqual(calculateFinancialMetrics(100000, null, 100, null), {
    costWithFee: 105000,
    profit: null,
    profitPercent: null,
    clickPercent: null,
    cpcShopee: null,
  });
});

test("zero denominators never return Infinity or NaN", () => {
  const result = calculateFinancialMetrics(0, 0, 0, 0);
  assert.equal(result.profitPercent, null);
  assert.equal(result.clickPercent, null);
  assert.equal(result.cpcShopee, null);
});

test("Meta update payload never overwrites nullable Shopee fields", () => {
  const update = dailyMetricMetaUpdate({ spend: "1200.50", clickFp: 4, cpcFp: "300.1250" });
  assert.deepEqual(update, { spend: "1200.50", clickFp: 4, cpcFp: "300.1250" });
  assert.equal("commission" in update, false);
  assert.equal("shopeeClicks" in update, false);
});
