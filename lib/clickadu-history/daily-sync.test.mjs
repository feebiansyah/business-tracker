import assert from "node:assert/strict";
import test from "node:test";

import {
  dailyBudgetSnapshot,
  sumZoneSpend,
  syncClickaduDailyMetrics,
} from "./daily-sync.ts";

const statistic = (zone, spent) => ({ zone, spent });

test("daily spend aggregates every zone with decimal precision and leaves empty data unknown", () => {
  assert.equal(sumZoneSpend([statistic("1", "0.1"), statistic("2", "0.2")]), "0.3");
  assert.equal(sumZoneSpend([]), null);
});

test("daily budget snapshots current dailyAmount only", () => {
  assert.equal(dailyBudgetSnapshot({ dailyAmount: "12.345678" }, "2026-09-19", "2026-09-19"), "12.345678");
  assert.equal(dailyBudgetSnapshot({ dailyAmount: "12.345678" }, "2026-09-18", "2026-09-19"), null);
  assert.equal(dailyBudgetSnapshot({}, "2026-09-19", "2026-09-19"), null);
});

test("account sync scopes configs, uses one-day statistics, and never fetches current budget for history", async () => {
  const calls = [];
  const result = await syncClickaduDailyMetrics(
    { shopeeAccountId: 7, targetDate: "2026-09-18", today: "2026-09-19" },
    {
      loadConfigs: async (accountId) => {
        calls.push(["configs", accountId]);
        return [{ id: 11, campaignId: "campaign-a" }, { id: 12, campaignId: "campaign-b" }];
      },
      getStatistics: async (input) => {
        calls.push(["statistics", input]);
        return input.campaignIds[0] === "campaign-a" ? [statistic("1", "1.25"), statistic("2", "2.75")] : [];
      },
      getCampaign: async () => assert.fail("historical sync must not read current campaign budget"),
      persist: async (input) => calls.push(["persist", input]),
    },
  );

  assert.equal(result.configCount, 2);
  assert.deepEqual(calls, [
    ["configs", 7],
    ["statistics", { campaignIds: ["campaign-a"], dateFrom: "2026-09-18", dateTill: "2026-09-18" }],
    ["persist", { clickaduCampaignConfigId: 11, date: "2026-09-18", spendUsd: "4", dailyBudget: null }],
    ["statistics", { campaignIds: ["campaign-b"], dateFrom: "2026-09-18", dateTill: "2026-09-18" }],
    ["persist", { clickaduCampaignConfigId: 12, date: "2026-09-18", spendUsd: null, dailyBudget: null }],
  ]);
});

test("current sync snapshots dailyAmount and remains scoped to loaded configs", async () => {
  const persisted = [];
  await syncClickaduDailyMetrics(
    { shopeeAccountId: 4, targetDate: "2026-09-19", today: "2026-09-19" },
    {
      loadConfigs: async (accountId) => {
        assert.equal(accountId, 4);
        return [{ id: 21, campaignId: "campaign-current" }];
      },
      getStatistics: async () => [statistic("10", "5.000001")],
      getCampaign: async (campaignId) => {
        assert.equal(campaignId, "campaign-current");
        return { dailyAmount: 25.5 };
      },
      persist: async (input) => persisted.push(input),
    },
  );
  assert.deepEqual(persisted, [{ clickaduCampaignConfigId: 21, date: "2026-09-19", spendUsd: "5.000001", dailyBudget: "25.5" }]);
});
