import assert from "node:assert/strict";
import test from "node:test";
import { dailyBudgetSnapshot, getClickaduSyncStart, indonesiaToday, listDatesInclusive, sumZoneSpend, syncClickaduDailyMetrics } from "./daily-sync.ts";

const statistic = (zone, spent) => ({ zone, spent });

test("Asia/Jakarta today is independent from the server date boundary", () => {
  assert.equal(indonesiaToday(new Date("2026-09-20T17:30:00.000Z")), "2026-09-21");
});

test("sync start overlaps checkpoint and recent D-1 while first sync is bounded", () => {
  assert.equal(getClickaduSyncStart({ checkpoint: "2026-09-18", latestMetricDate: null, today: "2026-09-21" }), "2026-09-18");
  assert.equal(getClickaduSyncStart({ checkpoint: "2026-09-20", latestMetricDate: null, today: "2026-09-21" }), "2026-09-20");
  assert.equal(getClickaduSyncStart({ checkpoint: "2026-09-21", latestMetricDate: null, today: "2026-09-21" }), "2026-09-20");
  assert.equal(getClickaduSyncStart({ checkpoint: null, latestMetricDate: "2026-09-18", today: "2026-09-21" }), "2026-09-18");
  assert.equal(getClickaduSyncStart({ checkpoint: null, latestMetricDate: null, today: "2026-09-21" }), "2026-09-21");
  assert.deepEqual(listDatesInclusive("2026-09-18", "2026-09-21"), ["2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21"]);
});

test("daily spend aggregates every zone with decimal precision and leaves empty data unknown", () => {
  assert.equal(sumZoneSpend([statistic("1", "0.1"), statistic("2", "0.2")]), "0.3");
  assert.equal(sumZoneSpend([]), null);
});

test("daily budget snapshots current dailyAmount only", () => {
  assert.equal(dailyBudgetSnapshot({ dailyAmount: "12.345678" }, "2026-09-21", "2026-09-21"), "12.345678");
  assert.equal(dailyBudgetSnapshot({ dailyAmount: "12.345678" }, "2026-09-20", "2026-09-21"), null);
});

test("automatic catch-up processes each date, advances coverage after persistence, and gets current budget once", async () => {
  const calls = [];
  const result = await syncClickaduDailyMetrics({ shopeeAccountId: 7, today: "2026-09-21" }, {
    loadConfigs: async (accountId) => {
      assert.equal(accountId, 7);
      return [{ id: 11, campaignId: "campaign-a", historySyncedThrough: "2026-09-18", latestMetricDate: "2026-09-18" }];
    },
    getStatistics: async (input) => {
      calls.push(["statistics", input.dateFrom]);
      return input.dateFrom === "2026-09-19" ? [] : [statistic("1", "1.25"), statistic("2", "2.75")];
    },
    getCampaign: async (campaignId) => { calls.push(["campaign", campaignId]); return { dailyAmount: "25.5" }; },
    persistDay: async (input) => calls.push(["persist", input]),
  });
  assert.deepEqual(calls, [
    ["statistics", "2026-09-18"], ["persist", { clickaduCampaignConfigId: 11, date: "2026-09-18", spendUsd: "4", dailyBudget: null }],
    ["statistics", "2026-09-19"], ["persist", { clickaduCampaignConfigId: 11, date: "2026-09-19", spendUsd: null, dailyBudget: null }],
    ["statistics", "2026-09-20"], ["persist", { clickaduCampaignConfigId: 11, date: "2026-09-20", spendUsd: "4", dailyBudget: null }],
    ["statistics", "2026-09-21"], ["campaign", "campaign-a"], ["persist", { clickaduCampaignConfigId: 11, date: "2026-09-21", spendUsd: "4", dailyBudget: "25.5" }],
  ]);
  assert.deepEqual(result, { configCount: 1, dateCount: 4, from: "2026-09-18", through: "2026-09-21" });
});

test("failed API or persistence never advances the failed date", async () => {
  const persisted = [];
  await assert.rejects(() => syncClickaduDailyMetrics({ shopeeAccountId: 1, today: "2026-09-21" }, {
    loadConfigs: async () => [{ id: 1, campaignId: "a", historySyncedThrough: "2026-09-19", latestMetricDate: null }],
    getStatistics: async ({ dateFrom }) => { if (dateFrom === "2026-09-20") throw new Error("API failed"); return [statistic("1", "1")]; },
    getCampaign: async () => assert.fail("today must not be reached"),
    persistDay: async (input) => persisted.push(input.date),
  }), /API failed/);
  assert.deepEqual(persisted, ["2026-09-19"]);

  let attempts = 0;
  await assert.rejects(() => syncClickaduDailyMetrics({ shopeeAccountId: 1, today: "2026-09-21" }, {
    loadConfigs: async () => [{ id: 1, campaignId: "a", historySyncedThrough: "2026-09-21", latestMetricDate: null }],
    getStatistics: async () => [statistic("1", "1")],
    getCampaign: async () => ({ dailyAmount: "2" }),
    persistDay: async () => { attempts += 1; throw new Error("DB failed"); },
  }), /DB failed/);
  assert.equal(attempts, 1);
});
