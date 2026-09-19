import assert from "node:assert/strict";
import test from "node:test";

import { getClickaduCampaignList, getClickaduDailyHistory } from "./queries.ts";

test("campaign list is scoped to the Shopee account", async () => {
  let received;
  const db = { clickaduCampaignConfig: { findMany: async (args) => { received = args; return []; } } };
  assert.deepEqual(await getClickaduCampaignList(db, 8), []);
  assert.deepEqual(received.where, { shopeeAccountId: 8 });
});

test("history verifies config ownership and paginates newest rows server-side", async () => {
  const calls = [];
  const db = {
    clickaduCampaignConfig: { findFirst: async (args) => { calls.push(["config", args]); return { id: 12, campaignId: "42", label: "ADU", sourceTag: "ADU" }; } },
    clickaduCampaignDailyMetric: {
      count: async (args) => { calls.push(["count", args]); return 26; },
      findMany: async (args) => { calls.push(["rows", args]); return [{ id: 1, date: new Date("2026-09-19T00:00:00.000Z"), spendUsd: null, dailyBudget: null }]; },
    },
  };
  const result = await getClickaduDailyHistory(db, 8, 12, { page: 2, pageSize: 25, dir: "desc" });
  assert.equal(result?.pagination.total, 26);
  assert.equal(result?.rows[0].spendUsd, null);
  assert.deepEqual(calls[0][1].where, { id: 12, shopeeAccountId: 8 });
  assert.deepEqual(calls[2][1].where, { clickaduCampaignConfigId: 12 });
  assert.equal(calls[2][1].skip, 25);
  assert.equal(calls[2][1].take, 25);
  assert.deepEqual(calls[2][1].orderBy, [{ date: "desc" }, { id: "asc" }]);
});

test("history rejects a config outside the Shopee account and supports empty history", async () => {
  const missing = await getClickaduDailyHistory({ clickaduCampaignConfig: { findFirst: async () => null } }, 8, 99, { page: 1, pageSize: 25, dir: "desc" });
  assert.equal(missing, null);

  const empty = await getClickaduDailyHistory({
    clickaduCampaignConfig: { findFirst: async () => ({ id: 12, campaignId: "42", label: null, sourceTag: "ADU" }) },
    clickaduCampaignDailyMetric: { count: async () => 0, findMany: async () => [] },
  }, 8, 12, { page: 1, pageSize: 25, dir: "desc" });
  assert.deepEqual(empty?.rows, []);
  assert.equal(empty?.pagination.page, 1);
});
