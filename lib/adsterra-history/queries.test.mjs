import assert from "node:assert/strict";
import test from "node:test";
import { getAdsterraDailyHistory, getAdsterraDailySyncConfigs } from "./queries.ts";

test("sync configs are account-scoped and bootstrap latest persisted date", async () => {
  let args; const rows = await getAdsterraDailySyncConfigs({ adsterraCampaignConfig: { findMany: async (value) => { args = value; return [{ id: 3, campaignId: "9", historySyncedThrough: null, dailyMetrics: [{ date: new Date("2026-09-18T00:00:00Z") }] }]; } } }, 7);
  assert.deepEqual(args.where, { shopeeAccountId: 7 }); assert.deepEqual(rows[0], { id: 3, campaignId: "9", historySyncedThrough: null, latestMetricDate: "2026-09-18" });
});
test("all columns sort in SQL null-last with stable LIMIT/OFFSET", async () => {
  const expressions = { date: "metric.date", spendUsd: "metric.spendUsd", spendIdr: "metric.spendUsd * 19000", commission: "metric.commissionIdr", profit: "metric.commissionIdr - metric.spendUsd * 19000" };
  for (const [sort, expression] of Object.entries(expressions)) { let query; const result = await getAdsterraDailyHistory({ adsterraCampaignConfig: { findFirst: async () => ({ id: 3, campaignId: "9", label: null, sourceTag: "TERRA" }) }, adsterraCampaignDailyMetric: { count: async () => 126 }, $queryRaw: async (value) => { query = value; return []; } }, 7, 3, { sort, dir: "desc", page: 9, pageSize: 50 }); const sql = query.sql.replace(/\s+/g, " "); assert.match(sql, new RegExp(expression.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))); assert.match(sql, /IS NULL ASC/); assert.match(sql, /metric\.date DESC, metric\.id ASC/); assert.match(sql, /LIMIT \? OFFSET \?/); assert.deepEqual(query.values.slice(-3), [3, 50, 100]); assert.equal(result.pagination.page, 3); }
});
test("history is Shopee-scoped, derives exact financials, and supports empty rows", async () => {
  let scope; const result = await getAdsterraDailyHistory({ adsterraCampaignConfig: { findFirst: async (args) => { scope = args.where; return { id: 3, campaignId: "9", label: null, sourceTag: "TERRA" }; } }, adsterraCampaignDailyMetric: { count: async () => 1 }, $queryRaw: async () => [{ id: 1, date: new Date("2026-09-21T00:00:00Z"), spendUsd: { toString: () => "20.2542" }, commissionIdr: { toString: () => "498581" } }] }, 7, 3, { sort: "date", dir: "desc", page: 1, pageSize: 25 }); assert.deepEqual(scope, { id: 3, shopeeAccountId: 7 }); assert.equal(result.rows[0].profitIdr, "113751.2");
  assert.equal(await getAdsterraDailyHistory({ adsterraCampaignConfig: { findFirst: async () => null } }, 8, 3, { sort: "date", dir: "desc", page: 1, pageSize: 25 }), null);
});
