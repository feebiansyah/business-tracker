import assert from "node:assert/strict";
import test from "node:test";
import { buildDailyMetricView, summarizeCampaignMetrics } from "./view-model.ts";

test("summary preserves missing Shopee commission as null", () => {
  assert.deepEqual(summarizeCampaignMetrics([
    { date: "2026-08-31", spend: 100000, commission: null },
    { date: "2026-09-01", spend: 50000, commission: null },
  ]), {
    daysWithData: 2,
    totalSpend: 150000,
    costWithFee: 157500,
    totalCommission: null,
    profit: null,
    profitPercent: null,
  });
});

test("same-date input cannot inflate the derived day count", () => {
  assert.equal(summarizeCampaignMetrics([
    { date: "2026-09-01", spend: 100, commission: null },
    { date: "2026-09-01", spend: 200, commission: null },
  ]).daysWithData, 1);
});

test("daily view keeps every Shopee-derived value null before import", () => {
  assert.deepEqual(buildDailyMetricView({ date: "2026-09-01", spend: 100000, commission: null, clickFp: 50, shopeeClicks: null, cpcFp: 2000 }), {
    date: "2026-09-01",
    spend: 100000,
    costWithFee: 105000,
    commission: null,
    profit: null,
    profitPercent: null,
    clickFp: 50,
    shopeeClicks: null,
    clickPercent: null,
    cpcFp: 2000,
    cpcShopee: null,
  });
});
