import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./sync-baseline.test.mjs";

function fixture({ failure, always = false } = {}) {
  const rows = new Map([["a:2026-11-05", { note: "keep", completed: true, commission: "99", shopeeClicks: 9 }]]), groups = [], attempts = []; let failed = false, checkpoint = 0;
  const db = {
    campaignDailyMetric: { upsert: args => ({ then(resolve,reject) { return Promise.resolve().then(() => { const k = args.where.campaignId_date.campaignId + ":" + args.where.campaignId_date.date.toISOString().slice(0,10); attempts.push(k); rows.set(k,{ ...rows.get(k),...args.update }); }).then(resolve,reject); } }) },
    campaign: { updateMany: async () => { checkpoint++; } },
    $executeRaw: async () => 0,
    $transaction: async operations => {
      groups.push(operations.length);
      if (groups.length >= 2 && failure && (!failed || always)) { failed = true; throw Object.assign(new Error("transaction failure"),{ code: failure }); }
      return Promise.all(operations);
    },
  };
  const api = loadTs("lib/filter/persistence.ts",{ "@/lib/prisma": { prisma: db } });
  const insights = Array.from({ length: 251 },(_,i) => ({ campaign_id: "meta-" + i, date_start: "2026-11-05", spend: "3", inline_link_clicks: "4", cost_per_inline_link_click: "0.75" }));
  const ids = new Map(insights.map((row,i) => [row.campaign_id,i===0 ? "a" : String(i)]));
  return { ...api, run: () => api.persistInsightChunk(ids, insights, [...ids.values()],"2026-11-05"), rows, groups, attempts, checkpoint: () => checkpoint };
}

test("large insight ranges use bounded groups, preserve manual fields and upsert without duplicates", async () => {
  const h = fixture(); assert.equal(await h.run(),251);
  assert.deepEqual(h.groups,[100,100,51]); assert.equal(h.rows.size,251); assert.equal(h.checkpoint(),1);
  assert.equal(h.rows.get("a:2026-11-05").note,"keep"); assert.equal(h.rows.get("a:2026-11-05").completed,true);
  assert.equal(h.rows.get("a:2026-11-05").commission,"99"); assert.equal(h.rows.get("a:2026-11-05").shopeeClicks,9);
  await h.run(); assert.equal(h.rows.size,251);
});
test("P2034 retries the failed group only, with a finite limit and no early checkpoint", async () => {
  const h = fixture({ failure: "P2034" }); await h.run();
  assert.deepEqual(h.groups,[100,100,100,51]); assert.equal(h.attempts.length,251); assert.equal(h.checkpoint(),1);
  const exhausted = fixture({ failure: "P2034", always: true }); await assert.rejects(exhausted.run());
  assert.deepEqual(exhausted.groups,[100,100,100,100]); assert.equal(exhausted.checkpoint(),0);
});
test("non-P2034 errors are not retried and checkpoint remains unchanged", async () => {
  const h = fixture({ failure: "P2002" }); await assert.rejects(h.run()); assert.deepEqual(h.groups,[100,100]); assert.equal(h.checkpoint(),0);
});
