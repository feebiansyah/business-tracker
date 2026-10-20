import assert from "node:assert/strict";
import test from "node:test";
import * as blacklist from "./blacklist.ts";
import { AdsterraAmbiguousWriteError, AdsterraApiError } from "./client.ts";

const bid = (placementId, countryCode = "ID") => ({ placementId: String(placementId), countryCode, price: "0.015" });
const losing = [{ placement: "1", costIdr: "2000", roi: "-10", clicks: 10, impressions: 100 }];
function fixture(options = {}) {
  let blocked = options.blocked ?? [];
  let bids = options.bids ?? [bid(1), bid(1, "GLOBAL"), bid(1, "US"), bid(2)];
  let gets = 0;
  const calls = [];
  const deps = {
    async getBlacklist(campaign) { calls.push(["blacklist", campaign]); return [...blocked]; },
    async replaceBlacklist(campaign, ids) {
      calls.push(["PUT", campaign, ids]);
      if (options.blacklistError) throw new AdsterraApiError("HTTP 422");
      if (!options.blacklistMismatch) blocked = [...ids];
    },
    async getCustomBids(campaign) {
      calls.push(["GET", campaign]); gets++;
      if (options.getError === gets) throw new AdsterraApiError("GET failed");
      if (options.race && gets === 1) blocked = [2];
      return bids.map((x) => ({ ...x }));
    },
    async deleteCustomBids(campaign, keys) {
      calls.push(["DELETE", campaign, keys]);
      bids = bids.filter((x) => !keys.some((key) => key.placementId === x.placementId && key.countryCode === x.countryCode && !(options.partial && x.countryCode === "US")));
      if (options.ambiguous) throw new AdsterraAmbiguousWriteError();
    },
  };
  return { deps, calls, actual: () => bids };
}

test("verified blacklist resets every GEO only on blacklisted placements", async () => {
  assert.equal(typeof blacklist.replaceAdsterraBlacklistAndResetBids, "function");
  const f = fixture();
  const result = await blacklist.replaceAdsterraBlacklistAndResetBids("77", losing, f.deps);
  assert.equal(result.status, "UPDATED");
  assert.equal(result.customBidReset.status, "COMPLETE");
  assert.deepEqual(f.actual(), [bid(2)]);
  assert.deepEqual(f.calls.find((x) => x[0] === "DELETE"), ["DELETE", "77", [
    { placementId: "1", countryCode: "ID" }, { placementId: "1", countryCode: "GLOBAL" }, { placementId: "1", countryCode: "US" },
  ]]);
  assert.ok(f.calls.findIndex((x) => x[0] === "GET") > f.calls.findIndex((x) => x[0] === "PUT"));
});

test("NO_CHANGE still resets overrides, and subsequent ON never restores them", async () => {
  const f = fixture({ blocked: [1] });
  const result = await blacklist.replaceAdsterraBlacklistAndResetBids("77", losing, f.deps);
  assert.equal(result.status, "NO_CHANGE");
  assert.equal(result.customBidReset.status, "COMPLETE");
  assert.equal(f.calls.some((x) => x[0] === "PUT"), false);
  await blacklist.replaceAdsterraBlacklistAndResetBids("77", [], f.deps);
  assert.deepEqual(f.actual(), [bid(2)]);
});

test("no matching override means no DELETE", async () => {
  const f = fixture({ bids: [bid(2)] });
  const result = await blacklist.replaceAdsterraBlacklistAndResetBids("77", losing, f.deps);
  assert.equal(result.customBidReset.status, "COMPLETE");
  assert.equal(f.calls.some((x) => x[0] === "DELETE"), false);
});

for (const options of [{ blacklistError: true }, { blacklistMismatch: true }]) {
  test(`failed blacklist never requests or deletes bids: ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    await assert.rejects(blacklist.replaceAdsterraBlacklistAndResetBids("77", losing, f.deps));
    assert.equal(f.calls.some((x) => x[0] === "GET" || x[0] === "DELETE"), false);
  });
}

test("partially reset GEO produces explicit pending placements and not full success", async () => {
  const f = fixture({ partial: true });
  const result = await blacklist.replaceAdsterraBlacklistAndResetBids("77", losing, f.deps);
  assert.equal(result.customBidReset.status, "PARTIAL");
  assert.deepEqual(result.customBidReset.pendingPlacementIds, [1]);
  assert.deepEqual(f.actual(), [bid(1, "US"), bid(2)]);
});

test("ambiguous DELETE is verified by GET without retry", async () => {
  const f = fixture({ ambiguous: true });
  const result = await blacklist.replaceAdsterraBlacklistAndResetBids("77", losing, f.deps);
  assert.equal(result.customBidReset.status, "COMPLETE");
  assert.equal(f.calls.filter((x) => x[0] === "DELETE").length, 1);
  assert.equal(f.calls.filter((x) => x[0] === "GET").length, 2);
});

for (const getError of [1, 2]) {
  test(`GET failure ${getError} reports unverified placements, never success`, async () => {
    const f = fixture({ getError });
    const result = await blacklist.replaceAdsterraBlacklistAndResetBids("77", losing, f.deps);
    assert.equal(result.customBidReset.status, "PARTIAL");
    assert.deepEqual(result.customBidReset.pendingPlacementIds, [1]);
    assert.equal(result.customBidReset.bids, null);
  });
}

test("blacklist changes during bid GET: no stale DELETE and explicit conflict", async () => {
  const f = fixture({ race: true });
  const result = await blacklist.replaceAdsterraBlacklistAndResetBids("77", losing, f.deps);
  assert.equal(result.customBidReset.status, "PARTIAL");
  assert.equal(f.calls.some((x) => x[0] === "DELETE"), false);
});
