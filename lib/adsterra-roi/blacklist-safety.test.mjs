import assert from "node:assert/strict";
import test from "node:test";
import * as blacklist from "./blacklist.ts";
import { writeAdsterraPlacementCustomBid } from "./custom-bid-write.ts";

const oldBid = { placementId: "1", countryCode: "GLOBAL", price: "0.015" };
const losing = [{ placement: "1", costIdr: "2000", roi: "-10", clicks: 10, impressions: 100 }];

for (const experimental of [false, true]) {
test(`OFF -> reset -> ON during pending create never restores an unrelated old bid (experiment=${experimental})`, async () => {
  let bids = [{ ...oldBid }], blocked = [], firstRead = true, posts = 0;
  let snapshotReady, resume;
  const ready = new Promise((resolve) => { snapshotReady = resolve; });
  const resumed = new Promise((resolve) => { resume = resolve; });
  const client = {
    getBlacklist: async () => [...blocked],
    replaceBlacklist: async (_, ids) => { blocked = [...ids]; },
    getCustomBids: async () => {
      const snapshot = bids.map((x) => ({ ...x }));
      if (firstRead) { firstRead = false; snapshotReady(); await resumed; }
      return snapshot;
    },
    deleteCustomBids: async (_, keys) => { bids = bids.filter((x) => !keys.some((k) => k.placementId === x.placementId && k.countryCode === x.countryCode)); },
    setCustomBids: async (_, next) => {
      posts++;
      assert.deepEqual(next, [{ placementId: "2", countryCode: "ID", price: "0.02" }]);
      bids = next.map((x) => ({ ...x }));
      return bids;
    },
    updateCustomBids: async () => assert.fail("a missing override must not be PATCHed as an undocumented upsert"),
  };
  const attempt = writeAdsterraPlacementCustomBid({ shopeeAccountId: 2, configId: 7, placementId: "2", operation: "SAVE", expectedPrice: null, price: "0.02" }, {
    experiment: experimental ? { shopeeAccountId: 2, campaignId: "77", placementId: "2" } : null,
    loadConfig: async () => ({ id: 7, shopeeAccountId: 2, campaignId: "77" }), loadClient: async () => client,
  }).then((result) => ({ result }), (error) => ({ error }));
  await ready;
  const off = await blacklist.replaceAdsterraBlacklistAndResetBids("77", losing, client);
  assert.equal(off.customBidReset.status, "COMPLETE");
  assert.deepEqual(bids, []);
  await blacklist.replaceAdsterraBlacklistAndResetBids("77", [], client);
  resume();
  const outcome = await attempt;
  assert.ok(outcome.error, "a changed external snapshot must not be reported as a fully verified create");
  assert.equal(posts, experimental ? 1 : 0);
  assert.deepEqual(bids, experimental ? [{ placementId: "2", countryCode: "ID", price: "0.02" }] : []);
});
}

test("initial empty GET followed by a new GLOBAL override must not report COMPLETE", async () => {
  let bids = [], reads = 0;
  const result = await blacklist.resetBlacklistedCustomBids("77", [1], {
    getCustomBids: async () => { reads++; return bids.map((x) => ({ ...x })); },
    getBlacklist: async () => { bids = [{ ...oldBid }]; return [1]; },
    deleteCustomBids: async () => assert.fail("no override existed in the initial snapshot"),
  });
  assert.equal(reads, 2, "always perform a fresh final GET, even without DELETE");
  assert.equal(result.status, "PARTIAL");
  assert.deepEqual(result.pendingPlacementIds, [1]);
});

test("missing final GET after an initially empty snapshot is unverified, not COMPLETE", async () => {
  let reads = 0;
  const result = await blacklist.resetBlacklistedCustomBids("77", [1], {
    getCustomBids: async () => { if (++reads === 2) throw new Error("timeout"); return []; },
    getBlacklist: async () => [1],
    deleteCustomBids: async () => assert.fail("must not DELETE"),
  });
  assert.equal(result.status, "PARTIAL");
  assert.equal(result.bids, null);
});

const partial = { status: "UPDATED", customBidReset: { status: "PARTIAL", pendingPlacementIds: [1], message: "Reset belum selesai", bids: null } };
test("VERIFIED blacklist -> PARTIAL reset -> failed timestamp preserves partial result", async () => {
  let blocked = [], verified = false;
  const client = {
    getBlacklist: async () => { if (blocked.length) verified = true; return [...blocked]; },
    replaceBlacklist: async (_, ids) => { blocked = [...ids]; },
    getCustomBids: async () => { assert.equal(verified, true); return [{ ...oldBid }]; },
    deleteCustomBids: async () => { throw new Error("provider reset failed"); },
  };
  const result = await blacklist.runAdsterraBlacklistReplacement(() => blacklist.replaceAdsterraBlacklistAndResetBids("77", losing, client), async () => { throw new Error("private database detail"); });
  assert.equal(result.success, false);
  assert.deepEqual(result.customBidReset.pendingPlacementIds, [1]);
  assert.equal(result.customBidReset.status, "PARTIAL");
  assert.equal(result.metadata.status, "FAILED");
  assert.equal(result.lastBlacklistReplacedAt, null);
  assert.doesNotMatch(JSON.stringify(result), /private database detail/);
});

test("existing PATCH racing OFF/reset/ON does not fall back to POST when override vanished", async () => {
  let bids = [{ ...oldBid, countryCode: "ID" }], blocked = [], firstRead = true, posts = 0, patches = 0;
  let readyResolve, resume;
  const ready = new Promise((resolve) => { readyResolve = resolve; });
  const resumed = new Promise((resolve) => { resume = resolve; });
  const client = {
    getBlacklist: async () => [...blocked],
    replaceBlacklist: async (_, ids) => { blocked = [...ids]; },
    getCustomBids: async () => {
      const snapshot = bids.map((x) => ({ ...x }));
      if (firstRead) { firstRead = false; readyResolve(); await resumed; }
      return snapshot;
    },
    deleteCustomBids: async () => { bids = []; },
    setCustomBids: async () => { posts++; },
    updateCustomBids: async () => { patches++; throw new Error("Custom bids for update not found (HTTP 404)"); },
  };
  const attempt = writeAdsterraPlacementCustomBid({ shopeeAccountId: 2, configId: 7, placementId: "1", operation: "SAVE", expectedPrice: "0.015", price: "0.02" }, {
    loadConfig: async () => ({ id: 7, shopeeAccountId: 2, campaignId: "77" }), loadClient: async () => client,
  }).then((result) => ({ result }), (error) => ({ error }));
  await ready;
  await blacklist.replaceAdsterraBlacklistAndResetBids("77", losing, client);
  await blacklist.replaceAdsterraBlacklistAndResetBids("77", [], client);
  resume();
  const outcome = await attempt;
  assert.match(outcome.error.message, /404/);
  assert.equal(patches, 1);
  assert.equal(posts, 0);
  assert.deepEqual(bids, []);
});

test("verified provider success is not full success when mandatory timestamp fails", async () => {
  const result = await blacklist.runAdsterraBlacklistReplacement(async () => ({ ...partial, customBidReset: { ...partial.customBidReset, status: "COMPLETE", pendingPlacementIds: [] } }), async () => { throw new Error("failed"); });
  assert.equal(result.success, false);
  assert.equal(result.metadata.status, "FAILED");
});

test("provider failure never becomes metadata failure or triggers timestamp write", async () => {
  let records = 0;
  await assert.rejects(blacklist.runAdsterraBlacklistReplacement(async () => { throw new Error("provider verification failed"); }, async () => { records++; }), /provider verification failed/);
  assert.equal(records, 0);
});

test("NO_CHANGE preserves partial reset without recording a replacement timestamp", async () => {
  const result = await blacklist.runAdsterraBlacklistReplacement(async () => ({ ...partial, status: "NO_CHANGE" }), async () => assert.fail("no blacklist write"));
  assert.equal(result.success, false);
  assert.equal(result.metadata.status, "NOT_REQUIRED");
  assert.deepEqual(result.customBidReset.pendingPlacementIds, [1]);
});

test("confirmed replacement and metadata success remains full success", async () => {
  let at;
  const now = new Date("2026-10-20T01:00:00Z");
  const result = await blacklist.runAdsterraBlacklistReplacement(async () => ({ ...partial, customBidReset: { ...partial.customBidReset, status: "COMPLETE", pendingPlacementIds: [] } }), async (value) => { at = value; }, () => now);
  assert.equal(result.success, true);
  assert.equal(result.metadata.status, "RECORDED");
  assert.equal(at, now);
  assert.equal(result.lastBlacklistReplacedAt, "2026-10-20T01:00:00.000Z");
});

test("provider write rejection and provider verification failure have distinct stages", async () => {
  for (const [mismatch, stage] of [[false, "PROVIDER_WRITE"], [true, "PROVIDER_VERIFICATION"]]) {
    await assert.rejects(blacklist.replaceAdsterraBlacklistAndResetBids("77", losing, {
      getBlacklist: async () => [],
      replaceBlacklist: async () => { if (!mismatch) throw new Error("private provider detail"); },
      getCustomBids: async () => assert.fail("must not reset after failure"),
      deleteCustomBids: async () => assert.fail("must not delete after failure"),
    }), (error) => { assert.equal(error.stage, stage); assert.doesNotMatch(error.message, /private provider detail/); return true; });
  }
});
