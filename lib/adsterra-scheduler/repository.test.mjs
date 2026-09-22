import assert from "node:assert/strict";
import test from "node:test";
import { claimAdsterraScheduleRun, loadEnabledAdsterraScheduleConfigs } from "./repository.ts";

test("repository loads enabled configs once without exposing disabled campaigns", async () => {
  let args;
  const db = { adsterraCampaignConfig: { findMany: async (value) => { args = value; return []; } } };
  await loadEnabledAdsterraScheduleConfigs(db);
  assert.deepEqual(args, {
    where: { autoScheduleEnabled: true },
    select: { id: true, campaignId: true, shopeeAccountId: true },
    orderBy: [{ shopeeAccountId: "asc" }, { id: "asc" }],
  });
});

test("claim uses one atomic create and treats unique conflicts as already claimed", async () => {
  let creates = 0;
  const input = { adsterraCampaignConfigId: 3, businessDate: "2026-09-21", action: "ON" };
  const firstDb = { adsterraCampaignScheduleRun: { create: async ({ data }) => { creates += 1; assert.equal(data.status, "RUNNING"); return { id: 8 }; } } };
  assert.deepEqual(await claimAdsterraScheduleRun(firstDb, input), { id: 8 });
  const duplicateDb = { adsterraCampaignScheduleRun: { create: async () => { creates += 1; throw { code: "P2002" }; } } };
  assert.equal(await claimAdsterraScheduleRun(duplicateDb, input), null);
  assert.equal(creates, 2);
});
