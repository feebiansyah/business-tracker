import assert from "node:assert/strict";
import test from "node:test";
import { domainHarness, loadTs, fixedNow, day } from "./sync-baseline.test.mjs";
import { stateDb } from "./meta-sync-state.test.mjs";

export function batchHarness(options = {}) {
  const h = domainHarness(options), state = stateDb(h.wls);
  const db = Object.assign(state.db,{ shopeeAccount: h.db.shopeeAccount, metaAccount: h.db.metaAccount, campaign: h.db.campaign, campaignDailyMetric: h.db.campaignDailyMetric, metaAccountDailySpend: h.db.metaAccountDailySpend, campaignDailyBudgetSnapshot: h.db.campaignDailyBudgetSnapshot });
  let mode = options.mode, gate, fetches = 0, now = fixedNow;
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return Date.parse(now); } }
  class Client extends h.Client {
    usage=0;
    restoreSyncUsagePercent(value) { this.usage=value; }
    getSyncUsagePercent() { return this.usage; }
    async waitBetweenAccounts() { h.events.push({ name: "wait", usage: this.usage }); }
    async getSyncAccountStatus(id) { if (mode === "statusGate") await gate; if (mode === "reactivated") { h.events.push({ name: "status", id }); return 1; } return super.getAdAccountStatus(id); }
    async getSyncPage(kind,id,range,opts) {
      fetches++;
      if (mode === "highUsage") this.usage=95;
      if (mode === "limit") throw new h.MetaApiError("limit",17);
      if (mode === "deny") throw new h.MetaApiError("denied",200);
      if (mode === "deadline") throw new Pause("DEADLINE");
      if (mode === "many" && (kind === "campaigns" || kind === "insights")) {
        const start = Number(opts.after ?? 0), end = Math.min(start+100,300);
        h.events.push({ name: kind, id, range });
        const data = Array.from({ length: end-start },(_,i) => kind === "campaigns" ? { id: id+"-many-"+(start+i), name: "Campaign "+(start+i), start_time: "2026-03-03T00:00:00Z", daily_budget: "500000", status: "ACTIVE", effective_status: "ACTIVE" } : { campaign_id: id+"-many-"+(start+i), date_start: range.until, date_stop: range.until, spend: "3", inline_link_clicks: "1", cost_per_inline_link_click: "3" });
        return { data, ...(end<300 ? { after: String(end) } : {}) };
      }
      if (mode === "pages" && kind === "insights") return opts.after ? { data: await super.getCampaignInsights(id,range) } : { data: await super.getCampaignInsights(id,range), after: "page2" };
      if (mode === "late" && kind === "insights") return { data: [...await super.getCampaignInsights(id,range),{ campaign_id: "late", date_start: range.until, date_stop: range.until, spend: "99" }] };
      return { data: kind === "campaigns" ? await super.getCampaigns(id) : kind === "adSets" ? await super.getAdSets(id) : kind === "spend" ? await super.getAccountDailySpend(id,range) : await super.getCampaignInsights(id,range) };
    }
  }
  class Pause extends Error { constructor(reason) { super(reason); this.reason = reason; } }
  const stubs = { ...h.stubs, __date: Clock, "@/lib/prisma": { prisma: db }, "@/lib/meta/client": { MetaGraphClient: Client, MetaApiError: h.MetaApiError, MetaSyncPauseError: Pause } };
  const fresh = () => loadTs("lib/filter/meta-sync-batch.ts",stubs);
  const step = () => fresh().runMetaSyncBatch({ shopeeAccountId: 7, owner: "owner-" + Math.random(), now: new Date(now) });
  return { ...h,...state, db, step, fetches: () => fetches, setNow: value => { now=value; }, setMode: value => { mode = value; }, setGate: value => { gate = value; } };
}

async function finish(h,max=5000) {
  let result;
  for (let i=0;i<max;i++) { result = await h.step(); if (!result.shouldContinue) return result; }
  throw new Error("unbounded work loop");
}
for (const storedStatus of ["ACTIVE", "INACTIVE", "UNAVAILABLE"]) {
  test(`undefined account status preserves stored ${storedStatus} and continues campaign discovery`, async t => {
    const h = batchHarness();
    h.wls[0].status = storedStatus;
    t.mock.method(h.Client.prototype,"getAdAccountStatus",async () => undefined);
    await h.step();
    assert.equal(h.wls[0].status,storedStatus);
    assert.equal(h.events.filter(event => event.name === "wl.update").length,0);
    assert.equal([...h.progress.values()][0].phase,"METADATA");
    await h.step();
    assert.equal(h.events.filter(event => event.name === "campaigns").length,1);
    assert.equal(h.wls[0].status,storedStatus);
  });
}

test("61 WL run through bounded calls, durable resume after every phase, final summary and idempotence", async () => {
  const h = batchHarness({ count: 61 }); let calls = 0, result;
  do {
    const before = h.events.filter(e => ["status","campaigns","adSets","spend","insights"].includes(e.name)).length;
    result = await h.step(); calls++;
    const after = h.events.filter(e => ["status","campaigns","adSets","spend","insights"].includes(e.name)).length;
    assert(after-before <= 1,"one provider page/status per call");
  } while (result.shouldContinue && calls < 1000);
  assert.equal(result.progress.status,"COMPLETE"); assert.equal(result.progress.summary.wlSucceeded,61); assert(calls>61 && calls<1000);
  assert.equal(h.metrics.size,122); assert.equal(h.spends.size,61);
  Object.assign(h.metrics.get("1:2026-11-06"),{ note: "same-day manual", completed: true, commission: "321", shopeeClicks: 11 });
  await finish(h); assert.equal(h.metrics.size,122); assert.equal(h.spends.size,61);
  assert.equal(h.metrics.get("1:2026-11-05").note,"manual"); assert.equal(h.metrics.get("1:2026-11-05").completed,true);
  assert.equal(h.metrics.get("1:2026-11-06").note,"same-day manual"); assert.equal(h.metrics.get("1:2026-11-06").completed,true);
  assert.equal(h.metrics.get("1:2026-11-06").commission,"321"); assert.equal(h.metrics.get("1:2026-11-06").shopeeClicks,11);
});
test("small ACTIVE final domain results and GET order equal baseline, including Ad Set budget", async () => {
  for (const adSetBudget of [false,true]) {
    const baseline = domainHarness({ adSetBudget }); const before = await baseline.load("lib/filter/sync.ts",true).syncFilter(7);
    const h = batchHarness({ adSetBudget }); const after = (await finish(h)).progress.summary;
    assert.deepEqual(after,before);
    const stringify = map => JSON.stringify([...map]);
    assert.equal(stringify(h.metrics),stringify(baseline.metrics)); assert.equal(stringify(h.spends),stringify(baseline.spends)); assert.equal(stringify(h.snapshots),stringify(baseline.snapshots));
    assert.deepEqual(h.events.filter(e => ["status","campaigns","adSets","spend","insights"].includes(e.name)),baseline.events.filter(e => ["status","campaigns","adSets","spend","insights"].includes(e.name)));
  }
});
test("March history, INACTIVE cap, UNAVAILABLE and reactivation retain baseline boundaries", async () => {
  const h = batchHarness({ inactive: true, checkpoint: null }); const result = await finish(h);
  assert.equal(result.progress.summary.wlSkipped,1); assert.equal(h.wls[0].status,"INACTIVE"); assert.equal(h.snapshots.size,0);
  const ranges = h.events.filter(e => e.name === "insights").map(e => e.range); assert.equal(ranges.length,9); assert.equal(ranges[0].since,"2026-03-03"); assert.equal(ranges.at(-1).until,"2026-11-05");
  for (const unavailable of [10,100,200]) {
    const denied = batchHarness({ unavailable }); const end = await finish(denied); assert.equal(end.progress.summary.wlSkipped,1); assert.equal(denied.wls[0].status,"UNAVAILABLE"); assert.equal(denied.fetches(),0);
  }
});
test("two callers issue one status request; live lease blocks expiry reclaim and stale generation writes", async () => {
  const h = batchHarness({ mode: "statusGate" }); let release;
  h.setGate(new Promise(resolve => { release = resolve; }));
  const first = h.step(); await new Promise(resolve => setTimeout(resolve,100));
  const second = await h.step(); assert.equal(second.blocked,true);
  const run = [...h.runs.values()][0]; assert.equal(run.leaseOwner !== null,true);
  release(); await first; assert.equal(run.leaseOwner,null);
});
test("code 17 pauses without advancing WL, final rejection yields PARTIAL and later run retries", async () => {
  const h = batchHarness({ count: 2 }); await h.step(); h.setMode("limit");
  const paused = await h.step(); assert.equal(paused.paused,true); assert.equal(paused.progress.status,"PAUSED_RATE_LIMIT"); assert.equal(h.events.filter(e => e.name === "status").length,1);
  h.setMode("deny"); await h.step(); h.setMode(null);
  const partial = await finish(h); assert.equal(partial.progress.status,"PARTIAL"); assert.equal(partial.progress.summary.wlFailed,1); assert.equal(partial.progress.summary.wlSucceeded,1);
  assert.equal((await finish(h)).progress.status,"COMPLETE");
});
test("page cursor commits without date checkpoint; replay is idempotent and last page advances", async () => {
  const h = batchHarness({ mode: "pages", checkpoint: "2026-11-04" });
  for (let i=0;i<20;i++) {
    await h.step(); const p = [...h.progress.values()][0];
    if (p.phase === "CAMPAIGN_INSIGHTS" && p.cursor.after === "page2") break;
  }
  assert.equal(h.campaigns.get("meta-100").historySyncedThrough.toISOString().slice(0,10),"2026-11-04");
  const size = h.metrics.size; const p = [...h.progress.values()][0]; p.cursor.after = undefined; p.cursor.seen = [];
  await h.step(); assert.equal(h.metrics.size,size); await h.step(); assert.equal(h.metrics.size,size);
  assert.equal(h.campaigns.get("meta-100").historySyncedThrough.toISOString().slice(0,10),"2026-11-06");
});
test("expired lease reruns only its unfinished unit; midnight resume keeps fixed target", async () => {
  const h = batchHarness(); await h.step();
  const run = [...h.runs.values()][0]; run.leaseOwner = "crashed"; run.leaseExpiresAt = day("2026-11-05");
  await h.step(); assert.equal([...h.runs.values()][0].targetDate.toISOString().slice(0,10),"2026-11-06");
  assert.equal(run.leaseOwner,null);
});

test("hundreds of campaigns and March history paginate with bounded metadata groups and late discovery excluded", async () => {
  const h = batchHarness({ mode: "many", checkpoint: null, count: 2 });
  let result, calls=0;
  do {
    const before = h.fetches(), writes = h.events.filter(e => e.name === "campaign.upsert").length;
    result = await h.step(); calls++;
    assert(h.fetches()-before<=1);
    assert(h.events.filter(e => e.name === "campaign.upsert").length-writes<=50);
  } while (result.shouldContinue && calls<150);
  assert.equal(result.progress.status,"COMPLETE"); assert.equal(result.progress.summary.campaignsProcessed,600);
  assert.equal(h.metrics.size,5402); // Two WL × 300 campaigns × 9 dates plus two preserved manual rows.
  assert.equal(h.events.filter(e => e.name === "insights").length,54);
});

test("reactivation uses ACTIVE dates and snapshots on the next run", async () => {
  const h = batchHarness({ inactive: true }); await finish(h); h.setMode("reactivated"); h.events.length=0;
  const result = await finish(h);
  assert.equal(h.wls[0].status,"ACTIVE"); assert.equal(result.progress.summary.wlSucceeded,1);
  assert.equal(h.events.find(e => e.name === "insights").range.until,"2026-11-06"); assert.equal(h.snapshots.size,1);
});

test("P2034 replays only DB unit, never GET or previously counted summary", async () => {
  const h = batchHarness();
  for (let i=0;i<3;i++) await h.step();
  assert.equal([...h.progress.values()][0].cursor.step,"PERSIST");
  const original = h.db.$transaction; let injected=false;
  h.db.$transaction = (fn,...args) => original(async tx => {
    const result = await fn(tx);
    if (!injected) { injected=true; throw Object.assign(new Error("deadlock"),{ code: "P2034" }); }
    return result;
  },...args);
  const fetches = h.fetches(); await h.step();
  assert.equal(h.fetches(),fetches); assert.equal([...h.runs.values()][0].summary.campaignsProcessed,1);
});

test("a late old owner cannot publish or release a replacement generation", async () => {
  const h = batchHarness({ mode: "statusGate" }); let release;
  h.setGate(new Promise(resolve => { release=resolve; }));
  const pending = h.step(); await new Promise(resolve => setTimeout(resolve,100));
  const run = [...h.runs.values()][0]; run.generation++; run.leaseOwner="replacement";
  release(); await assert.rejects(pending);
  assert.equal(run.leaseOwner,"replacement"); assert.equal([...h.progress.values()][0].phase,"STATUS");
});

test("resume on a later day never backdates today's budget into the run target date", async () => {
  const h = batchHarness(); await h.step(); h.setNow("2026-11-07T05:00:00Z");
  await finish(h);
  assert.equal([...h.runs.values()][0].targetDate.toISOString().slice(0,10),"2026-11-06");
  assert.equal(h.snapshots.has("1:2026-11-06"),false); assert.equal(h.snapshots.has("1:2026-11-07"),true);
  assert.equal(h.events.find(e => e.name === "insights").range.until,"2026-11-06");
});
test("metadata observed before midnight is not presented as a current or backdated budget snapshot after resume", async () => {
  const h = batchHarness(); for (let i=0;i<3;i++) await h.step();
  h.setNow("2026-11-07T05:00:00Z"); await finish(h);
  assert.equal(h.snapshots.size,0); assert.equal(h.campaigns.get("meta-100").effectiveDailyBudget.toString(),"500000");
});
test("campaign arriving after the coverage snapshot waits until the next run", async () => {
  const h = batchHarness();
  while ([...h.progress.values()][0]?.phase !== "ACCOUNT_SPEND") await h.step();
  h.campaigns.set("late",{ ...h.campaigns.get("meta-100"), id: 999, metaCampaignId: "late", historySyncedThrough: null });
  h.setMode("late"); await finish(h);
  assert.equal(h.campaigns.get("late").historySyncedThrough,null); assert.equal([...h.metrics.values()].some(row => row.campaignId===999),false);
});

test("usage from a Meta page survives a fresh ADVANCE unit and the following WL", async () => {
  const h = batchHarness({ mode: "highUsage", count: 2 });
  await h.step(); await h.step(); h.setMode(null);
  await finish(h);
  const waits = h.events.filter(e => e.name === "wait"); assert.equal(waits.length,1); assert.equal(waits[0].usage,95);
  assert.equal([...h.runs.values()][0].usagePercent,95);
});
