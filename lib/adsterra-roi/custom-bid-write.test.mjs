import assert from "node:assert/strict";
import test from "node:test";
import { AdsterraAmbiguousWriteError } from "./client.ts";
import { AdsterraCustomBidWriteError, writeAdsterraPlacementCustomBid } from "./custom-bid-write.ts";

const bid = (placementId, price, countryCode = "ID") => ({ placementId: String(placementId), price: String(price), countryCode });
const input = (operation, placementId, expectedPrice, price) => ({ operation, shopeeAccountId: 2, configId: 7, placementId: String(placementId), expectedPrice, ...(price === undefined ? {} : { price }) });

function fixture(initial, options = {}) {
  let actual = initial.map((x) => ({ ...x }));
  const calls = [];
  let writes = 0;
  const client = {
    async getCustomBids(campaignId) {
      calls.push(["GET", campaignId]);
      return options.verifyMismatch && writes > 0 ? [bid("999", "1", "GLOBAL")] : actual.map((x) => ({ ...x }));
    },
    async setCustomBids(campaignId, bids) {
      writes += 1;
      calls.push(["POST", campaignId, bids.map((x) => ({ ...x }))]);
      actual = bids.map((x) => ({ ...x }));
      if (options.ambiguous) throw new AdsterraAmbiguousWriteError();
    },
    async updateCustomBids(campaignId, bids) {
      writes += 1;
      calls.push(["PATCH", campaignId, bids.map((x) => ({ ...x }))]);
      const updates = new Set(bids.map((x) => `${x.placementId}:${x.countryCode}`));
      actual = [...actual.filter((x) => !updates.has(`${x.placementId}:${x.countryCode}`)), ...bids];
      if (options.ambiguous) throw new AdsterraAmbiguousWriteError();
    },
    async deleteCustomBids(campaignId, bids) {
      writes += 1;
      calls.push(["DELETE", campaignId, bids.map((x) => ({ ...x }))]);
      const removals = new Set(bids.map((x) => `${x.placementId}:${x.countryCode}`));
      actual = actual.filter((x) => !removals.has(`${x.placementId}:${x.countryCode}`));
      if (options.ambiguous) throw new AdsterraAmbiguousWriteError();
    },
  };
  return {
    calls,
    deps: {
      loadConfig: async (accountId, configId) => {
        calls.push(["CONFIG", accountId, configId]);
        return options.foreignConfig ? { id: 7, shopeeAccountId: 3, campaignId: "77" } : { id: 7, shopeeAccountId: 2, campaignId: "77" };
      },
      loadClient: async (accountId) => { calls.push(["CLIENT", accountId]); return client; },
    },
  };
}

test("New ID custom bid POST sends the entire existing list, preserving GLOBAL and unrelated GEO", async () => {
  const f = fixture([bid(101, "0.01", "GLOBAL"), bid(102, "0.015", "US")]);
  const result = await writeAdsterraPlacementCustomBid(input("SAVE", 101, null, "0.012345"), f.deps);
  assert.equal(result.status, "UPDATED");
  assert.deepEqual(f.calls.filter((x) => ["POST", "PATCH", "DELETE"].includes(x[0])), [[
    "POST", "77", [bid(101, "0.01", "GLOBAL"), bid(102, "0.015", "US"), bid(101, "0.012345", "ID")],
  ]]);
  assert.equal(f.calls.filter((x) => x[0] === "GET").length, 2);
  assert.equal(result.bids.length, 3);
});

test("Existing ID override PATCH changes only the chosen Placement and preserves other GEO", async () => {
  const f = fixture([bid(101, "0.01", "ID"), bid(101, "0.02", "GLOBAL"), bid(102, "0.04", "ID")]);
  const result = await writeAdsterraPlacementCustomBid(input("SAVE", 101, "0.01", "0.03"), f.deps);
  assert.equal(result.status, "UPDATED");
  assert.deepEqual(f.calls.find((x) => x[0] === "PATCH"), ["PATCH", "77", [bid(101, "0.03", "ID")]]);
  assert.ok(result.bids.some((x) => x.placementId === "101" && x.countryCode === "GLOBAL" && x.price === "0.02"));
  assert.ok(result.bids.some((x) => x.placementId === "102" && x.price === "0.04"));
});

test("DELETE contains only the intended Placement + ID and does not touch GLOBAL", async () => {
  const f = fixture([bid(101, "0.01", "ID"), bid(101, "0.02", "GLOBAL"), bid(102, "0.04", "ID")]);
  const result = await writeAdsterraPlacementCustomBid(input("DELETE", 101, "0.01"), f.deps);
  assert.equal(result.status, "UPDATED");
  assert.deepEqual(f.calls.find((x) => x[0] === "DELETE"), ["DELETE", "77", [{ placementId: "101", countryCode: "ID" }]]);
  assert.equal(result.bids.length, 2);
  assert.ok(result.bids.some((x) => x.placementId === "101" && x.countryCode === "GLOBAL"));
});

test("Identical value does not make a write request", async () => {
  const f = fixture([bid(101, "0.01")]);
  const result = await writeAdsterraPlacementCustomBid(input("SAVE", 101, "0.010", "0.01"), f.deps);
  assert.equal(result.status, "NO_CHANGE");
  assert.equal(f.calls.filter((x) => ["POST", "PATCH", "DELETE"].includes(x[0])).length, 0);
});

test("Stale expected price cannot silently overwrite a concurrent change", async () => {
  const f = fixture([bid(101, "0.02")]);
  await assert.rejects(writeAdsterraPlacementCustomBid(input("SAVE", 101, "0.01", "0.03"), f.deps), /sudah berubah/);
  assert.equal(f.calls.filter((x) => ["POST", "PATCH", "DELETE"].includes(x[0])).length, 0);
});

test("Ambiguous network write verifies by GET and never retries a write", async () => {
  const f = fixture([bid(101, "0.01")], { ambiguous: true });
  const result = await writeAdsterraPlacementCustomBid(input("SAVE", 101, "0.01", "0.02"), f.deps);
  assert.equal(result.status, "UPDATED");
  assert.equal(f.calls.filter((x) => x[0] === "PATCH").length, 1);
  assert.equal(f.calls.filter((x) => x[0] === "GET").length, 2);
});

test("Verification mismatch fails instead of claiming success", async () => {
  const f = fixture([bid(101, "0.01")], { verifyMismatch: true });
  await assert.rejects(writeAdsterraPlacementCustomBid(input("SAVE", 101, "0.01", "0.02"), f.deps), /Verifikasi Custom Bid gagal/);
  assert.equal(f.calls.filter((x) => x[0] === "PATCH").length, 1);
});

test("Invalid input and cross-account config cannot trigger Custom Bid writes", async () => {
  for (const value of ["", "-1", "201", "1e2", "NaN"]) {
    const f = fixture([]);
    await assert.rejects(writeAdsterraPlacementCustomBid(input("SAVE", 101, null, value), f.deps), AdsterraCustomBidWriteError);
    assert.equal(f.calls.length, 0);
  }
  const foreign = fixture([], { foreignConfig: true });
  await assert.rejects(writeAdsterraPlacementCustomBid(input("SAVE", 101, null, "0.015"), foreign.deps), /tidak ditemukan/);
  assert.equal(foreign.calls.some((x) => x[0] === "CLIENT"), false);
});

test("Zero price is a permitted explicit bid; no old ID to delete is NO_CHANGE", async () => {
  const zero = fixture([]);
  const added = await writeAdsterraPlacementCustomBid(input("SAVE", 101, null, "0"), zero.deps);
  assert.equal(added.bids[0].price, "0");
  const empty = fixture([]);
  assert.equal((await writeAdsterraPlacementCustomBid(input("DELETE", 101, null), empty.deps)).status, "NO_CHANGE");
  assert.equal(empty.calls.some((x) => x[0] === "DELETE"), false);
});
