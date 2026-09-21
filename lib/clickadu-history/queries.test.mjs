import assert from "node:assert/strict";
import test from "node:test";

import { getClickaduCampaignList, getClickaduDailyHistory, getClickaduDailySyncConfigs } from "./queries.ts";

test("sync configs are account scoped and bootstrap from their latest persisted day", async () => {
  let received;
  const rows = await getClickaduDailySyncConfigs({ clickaduCampaignConfig: { findMany: async (args) => {
    received = args;
    return [{ id: 3, campaignId: "99", historySyncedThrough: null, dailyMetrics: [{ date: new Date("2026-09-18T00:00:00.000Z") }] }];
  } } }, 8);
  assert.equal(received.where.shopeeAccountId, 8);
  assert.deepEqual(rows, [{ id: 3, campaignId: "99", historySyncedThrough: null, latestMetricDate: "2026-09-18" }]);
});

test("campaign list is scoped to the Shopee account", async () => {
  let received;
  const db = { clickaduCampaignConfig: { findMany: async (args) => { received = args; return []; } } };
  assert.deepEqual(await getClickaduCampaignList(db, 8), []);
  assert.deepEqual(received.where, { shopeeAccountId: 8 });
});

const expressions = {
  date: "metric.date",
  spendUsd: "metric.spendUsd",
  spendIdr: "metric.spendUsd * 19000",
  commission: "metric.commissionIdr",
  profit: "metric.commissionIdr - metric.spendUsd * 19000",
};

test("all history columns sort in SQL with null-last ordering and stable pagination", async () => {
  for (const [sort, expression] of Object.entries(expressions)) {
    for (const dir of ["asc", "desc"]) {
      let query;
      const db = {
        clickaduCampaignConfig: { findFirst: async () => ({ id: 12, campaignId: "42", label: "ADU", sourceTag: "ADU" }) },
        clickaduCampaignDailyMetric: { count: async () => 126 },
        $queryRaw: async (value) => { query = value; return []; },
      };
      const result = await getClickaduDailyHistory(db, 8, 12, { sort, dir, page: 99, pageSize: 50 });
      const sql = query.sql.replace(/\s+/g, " ");
      assert.match(sql, new RegExp(expression.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(sql, /IS NULL ASC/);
      assert.match(sql, new RegExp(` ${dir.toUpperCase()}[, ]`));
      assert.match(sql, /metric\.date DESC, metric\.id ASC/);
      assert.match(sql, /LIMIT \? OFFSET \?/);
      assert.deepEqual(query.values.slice(-3), [12, 50, 100]);
      assert.equal(result.pagination.page, 3);
    }
  }
});

test("history returns only the requested SQL page and derives exact daily financials", async () => {
  const db = {
    clickaduCampaignConfig: { findFirst: async (args) => {
      assert.deepEqual(args.where, { id: 12, shopeeAccountId: 8 });
      return { id: 12, campaignId: "42", label: "ADU", sourceTag: "ADU" };
    } },
    clickaduCampaignDailyMetric: { count: async () => 26 },
    $queryRaw: async () => [{ id: 1, date: new Date("2026-09-19T00:00:00.000Z"), spendUsd: { toString: () => "20.2542" }, commissionIdr: { toString: () => "498581" } }],
  };
  const result = await getClickaduDailyHistory(db, 8, 12, { sort: "profit", dir: "desc", page: 2, pageSize: 25 });
  assert.deepEqual(result.rows[0], { id: 1, date: "2026-09-19", spendUsd: "20.2542", commissionIdr: "498581", spendIdr: "384829.8", profitIdr: "113751.2" });
  assert.deepEqual(result.pagination, { page: 2, pageSize: 25, total: 26, pageCount: 2 });
});

test("history rejects a config outside the Shopee account and supports empty history", async () => {
  const missing = await getClickaduDailyHistory({ clickaduCampaignConfig: { findFirst: async () => null } }, 8, 99, { sort: "date", dir: "desc", page: 1, pageSize: 25 });
  assert.equal(missing, null);
  const empty = await getClickaduDailyHistory({
    clickaduCampaignConfig: { findFirst: async () => ({ id: 12, campaignId: "42", label: null, sourceTag: "ADU" }) },
    clickaduCampaignDailyMetric: { count: async () => 0 },
    $queryRaw: async () => [],
  }, 8, 12, { sort: "date", dir: "desc", page: 1, pageSize: 25 });
  assert.deepEqual(empty.rows, []);
});
