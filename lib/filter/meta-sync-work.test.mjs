import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./sync-baseline.test.mjs";

test("planner exposes only one phase/range and advances March history without overlap loops", () => {
  const api = loadTs("lib/filter/meta-sync-work.ts");
  const coverage = api.buildMetaSyncCoverage({ inactive: false, spendCheckpoint: null, campaigns: [{ id: 1, metaCampaignId: "100", startDate: "2026-03-03", historySyncedThrough: null, metaStatus: "ACTIVE", effectiveDailyBudget: 500000 }] }, "2026-11-06");
  assert.equal(coverage.spend.length,9); assert.equal(coverage.insights.length,9);
  let cursor = { coverage, rangeIndex: 0 };
  for (let i=0; i<9; i++) {
    const unit = api.planNextMetaSyncUnit({ phase: "ACCOUNT_SPEND", cursor });
    assert.equal(unit.range.since, i===0 ? "2026-03-03" : `2026-${String(i+3).padStart(2,"0")}-01`);
    cursor = { ...cursor, rangeIndex: i+1 };
  }
  assert.equal(api.planNextMetaSyncUnit({ phase: "ACCOUNT_SPEND", cursor }).kind,"ADVANCE");
});

test("routine overlap, INACTIVE cap, missing start and immutable date match existing rules", () => {
  const api = loadTs("lib/filter/meta-sync-work.ts");
  const campaigns = [{ id: 1, metaCampaignId: "a", startDate: "2026-03-01", historySyncedThrough: "2026-11-06", metaStatus: "PAUSED", effectiveDailyBudget: 500000 }, { id: 2, metaCampaignId: "b", startDate: null, historySyncedThrough: null, metaStatus: "ACTIVE", effectiveDailyBudget: 500000 }];
  for (const inactive of [false,true]) {
    const result = api.buildMetaSyncCoverage({ inactive, spendCheckpoint: "2026-11-06", campaigns },"2026-11-06");
    assert.deepEqual(result.spend,[{ since: "2026-11-05", until: inactive ? "2026-11-05" : "2026-11-06" }]);
    assert.equal(result.insights[0].since,"2026-11-05"); assert.equal(result.insights[0].until,inactive ? "2026-11-05" : "2026-11-06");
    assert.equal(result.missingStartDates,1);
  }
  assert.deepEqual(api.planNextMetaSyncUnit({ phase: "DONE", cursor: {} }),{ kind: "DONE" });
  assert.deepEqual(api.planNextMetaSyncUnit({ phase: "STATUS", cursor: {} }),{ kind: "STATUS" });
});
