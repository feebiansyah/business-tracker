import assert from "node:assert/strict";
import test from "node:test";
import { AdsterraAmbiguousWriteError } from "./client.ts";
import { AdsterraCustomBidWriteError, writeAdsterraPlacementCustomBid } from "./custom-bid-write.ts";
import * as writeDomain from "./custom-bid-write.ts";

const bid = (placementId, price, countryCode = "ID") => ({ placementId: String(placementId), price: String(price), countryCode });
const input = (operation, placementId, expectedPrice, price) => ({ operation, shopeeAccountId: 2, configId: 7, placementId: String(placementId), expectedPrice, ...(price === undefined ? {} : { price }) });

function fixture(initial, options = {}) {
  let actual = initial.map((x) => ({ ...x }));
  const calls = [];
  let writes = 0;
  const client = {
    async getBlacklist(campaignId) {
      calls.push(["BLACKLIST", campaignId]);
      if (options.blacklistError) throw new Error("blacklist unavailable");
      if (options.postWriteBlacklistError && writes > 0) throw new Error("blacklist unavailable");
      if (options.postWriteBlocked && writes > 0) return options.postWriteBlocked;
      if (options.postWriteRace && writes > 0) return [101];
      return options.blocked ?? [];
    },
    async getCustomBids(campaignId) {
      calls.push(["GET", campaignId]);
      if (options.verifyError && writes > 0) throw new Error("verification unavailable");
      return options.verifyMismatch && writes > 0 ? [bid("999", "1", "GLOBAL")] : actual.map((x) => ({ ...x }));
    },
    async setCustomBids(campaignId, bids) {
      writes += 1;
      calls.push(["POST", campaignId, bids.map((x) => ({ ...x }))]);
      if (options.externalChange) actual = actual.map((x) => ({ ...x, price: "0.08" }));
      actual = options.additivePost ? [...actual, ...bids.map((x) => ({ ...x }))] : bids.map((x) => ({ ...x }));
      if (options.ambiguous) throw new AdsterraAmbiguousWriteError();
      return options.postResponseMismatch ? [] : actual.map((x) => ({ ...x }));
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
    actual: () => actual,
    deps: {
      experiment: options.experiment,
      allowCreate: options.allowCreate,
      loadConfig: async (accountId, configId) => {
        calls.push(["CONFIG", accountId, configId]);
        return options.foreignConfig ? { id: 7, shopeeAccountId: 3, campaignId: "77" } : { id: 7, shopeeAccountId: 2, campaignId: "77" };
      },
      loadClient: async (accountId) => { calls.push(["CLIENT", accountId]); return client; },
    },
  };
}

test("New ID override fails closed instead of sending an unsafe full-list POST", async () => {
  const f = fixture([bid(101, "0.01", "GLOBAL"), bid(102, "0.015", "US")]);
  await assert.rejects(writeAdsterraPlacementCustomBid(input("SAVE", 101, null, "0.012345"), f.deps), /belum diaktifkan/);
  assert.deepEqual(f.calls.filter((x) => ["POST", "PATCH", "DELETE"].includes(x[0])), []);
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
  const zero = fixture([bid(101, "0.01")]);
  const added = await writeAdsterraPlacementCustomBid(input("SAVE", 101, "0.01", "0"), zero.deps);
  assert.equal(added.bids[0].price, "0");
  const empty = fixture([]);
  assert.equal((await writeAdsterraPlacementCustomBid(input("DELETE", 101, null), empty.deps)).status, "NO_CHANGE");
  assert.equal(empty.calls.some((x) => x[0] === "DELETE"), false);
});

test("SAVE on blacklisted placement is rejected server-side even if value is unchanged", async () => {
  for (const price of ["0.01", "0.02"]) {
    const f = fixture([bid(101, "0.01")], { blocked: [101] });
    await assert.rejects(writeAdsterraPlacementCustomBid(input("SAVE", 101, "0.01", price), f.deps), /blacklist/i);
    assert.equal(f.calls.some((x) => ["POST", "PATCH", "DELETE"].includes(x[0])), false);
  }
});

test("manual DELETE remains permitted for blacklisted placement", async () => {
  const f = fixture([bid(101, "0.01")], { blocked: [101] });
  assert.equal((await writeAdsterraPlacementCustomBid(input("DELETE", 101, "0.01"), f.deps)).status, "UPDATED");
});

test("disabled create cannot replay stale overrides belonging to another blacklisted placement", async () => {
  const f = fixture([bid(102, "0.04", "GLOBAL")], { blocked: [102] });
  await assert.rejects(writeAdsterraPlacementCustomBid(input("SAVE", 101, null, "0.02"), f.deps), /belum diaktifkan/);
  assert.equal(f.calls.some((x) => x[0] === "POST"), false);
});

test("blacklist race before write is rejected without sending a write", async () => {
  const f = fixture([bid(101, "0.01")]);
  let reads = 0;
  let writes = 0;
  f.deps.loadClient = async () => ({
    getBlacklist: async () => ++reads === 1 ? [] : [101],
    getCustomBids: async () => [bid(101, "0.01")],
    updateCustomBids: async () => { writes++; },
  });
  await assert.rejects(writeAdsterraPlacementCustomBid(input("SAVE", 101, "0.01", "0.02"), f.deps), /blacklist/i);
  assert.equal(writes, 0);
});

test("blacklist race after PATCH resets the new override and refuses full success", async () => {
  const f = fixture([bid(101, "0.01"), bid(101, "0.03", "GLOBAL"), bid(102, "0.04")], { postWriteRace: true });
  await assert.rejects(writeAdsterraPlacementCustomBid(input("SAVE", 101, "0.01", "0.02"), f.deps), /Blacklist berubah/);
  assert.equal(f.calls.filter((x) => x[0] === "PATCH").length, 1);
  assert.deepEqual(f.calls.find((x) => x[0] === "DELETE"), ["DELETE", "77", [
    { placementId: "101", countryCode: "GLOBAL" }, { placementId: "101", countryCode: "ID" },
  ]]);
});

test("failed server blacklist read fails closed before SAVE", async () => {
  const f = fixture([], { blacklistError: true });
  await assert.rejects(writeAdsterraPlacementCustomBid(input("SAVE", 101, null, "0.02"), f.deps));
  assert.equal(f.calls.some((x) => ["POST", "PATCH", "DELETE"].includes(x[0])), false);
});

test("blacklist verification failure after SAVE warns about uncertain write, no automatic retry", async () => {
  const f = fixture([bid(101, "0.01")], { postWriteBlacklistError: true });
  await assert.rejects(writeAdsterraPlacementCustomBid(input("SAVE", 101, "0.01", "0.02"), f.deps), /mungkin sudah berubah.*verifikasi blacklist gagal/i);
  assert.equal(f.calls.filter((x) => x[0] === "PATCH").length, 1);
});

const experiment = { shopeeAccountId: 2, campaignId: "77", placementId: "101" };
test("localhost experiment POST contains only the operator's Placement + ID + price", async () => {
  const f = fixture([bid(102, "0.04", "GLOBAL"), bid(103, "0.03", "US")], { experiment, additivePost: true });
  const result = await writeAdsterraPlacementCustomBid(input("SAVE", 101, null, "0.015"), f.deps);
  assert.equal(result.status, "UPDATED");
  assert.deepEqual(f.calls.filter((x) => x[0] === "POST"), [["POST", "77", [bid(101, "0.015", "ID")]]]);
  assert.deepEqual(f.actual(), [bid(102, "0.04", "GLOBAL"), bid(103, "0.03", "US"), bid(101, "0.015")]);
});

test("experiment never sends old bids back when an external bid changes", async () => {
  const f = fixture([bid(102, "0.04", "GLOBAL")], { experiment, additivePost: true, externalChange: true });
  await assert.rejects(writeAdsterraPlacementCustomBid(input("SAVE", 101, null, "0.015"), f.deps), /Verifikasi Custom Bid gagal/);
  assert.deepEqual(f.calls.find((x) => x[0] === "POST"), ["POST", "77", [bid(101, "0.015")]]);
  assert.equal(f.actual().find((x) => x.placementId === "102").price, "0.08");
  assert.equal(f.calls.some((x) => x[0] === "PATCH" || x[0] === "DELETE"), false);
});

test("unexpected replacing POST behavior is an error, without bulk restore", async () => {
  const f = fixture([bid(102, "0.04", "GLOBAL")], { experiment });
  await assert.rejects(writeAdsterraPlacementCustomBid(input("SAVE", 101, null, "0.015"), f.deps), /Verifikasi Custom Bid gagal/);
  assert.equal(f.calls.filter((x) => x[0] === "POST").length, 1);
  assert.equal(f.calls.some((x) => x[0] === "PATCH" || x[0] === "DELETE"), false);
});

test("experiment POST timeout is not retried or claimed successful even if GET finds the bid", async () => {
  const f = fixture([], { experiment, ambiguous: true });
  await assert.rejects(writeAdsterraPlacementCustomBid(input("SAVE", 101, null, "0.015"), f.deps), /POST.*tidak dapat dipastikan/);
  assert.equal(f.calls.filter((x) => x[0] === "POST").length, 1);
  assert.equal(f.calls.filter((x) => x[0] === "GET").length, 2);
});

test("experiment failed verification GET cannot report success", async () => {
  const f = fixture([], { experiment, verifyError: true });
  await assert.rejects(writeAdsterraPlacementCustomBid(input("SAVE", 101, null, "0.015"), f.deps), /verifikasi API gagal/);
  assert.equal(f.calls.filter((x) => x[0] === "POST").length, 1);
});

test("experiment inconsistent POST response is an error even when verification GET matches", async () => {
  const f = fixture([], { experiment, postResponseMismatch: true });
  await assert.rejects(writeAdsterraPlacementCustomBid(input("SAVE", 101, null, "0.015"), f.deps), /POST.*tidak dapat dipastikan/);
  assert.equal(f.calls.filter((x) => x[0] === "POST").length, 1);
  assert.equal(f.calls.filter((x) => x[0] === "GET").length, 2);
});

test("active experiment restricts create, edit and delete to its exact server target", async () => {
  for (const mismatch of [{ ...experiment, shopeeAccountId: 3 }, { ...experiment, campaignId: "88" }, { ...experiment, placementId: "102" }]) {
    for (const operation of ["SAVE", "DELETE"]) {
      const f = fixture([bid(101, "0.01")], { experiment: mismatch });
      await assert.rejects(writeAdsterraPlacementCustomBid(input(operation, 101, "0.01", "0.015"), f.deps), /target uji/);
      assert.equal(f.calls.some((x) => ["POST", "PATCH", "DELETE"].includes(x[0])), false);
    }
  }
});

test("experiment DELETE after create removes only its selected ID override", async () => {
  const f = fixture([], { experiment, additivePost: true });
  await writeAdsterraPlacementCustomBid(input("SAVE", 101, null, "0.015"), f.deps);
  const result = await writeAdsterraPlacementCustomBid(input("DELETE", 101, "0.015"), f.deps);
  assert.deepEqual(result.bids, []);
  assert.deepEqual(f.calls.find((x) => x[0] === "DELETE"), ["DELETE", "77", [{ placementId: "101", countryCode: "ID" }]]);
});

test("server experiment requires development, loopback origin and one explicit target", () => {
  const env = { NODE_ENV: "development", ADSTERRA_CUSTOM_BID_TEST_TARGET: "2:77:101" };
  assert.deepEqual(writeDomain.readAdsterraCustomBidExperiment(env, "127.0.0.1:3000", "http://127.0.0.1:3000"), experiment);
  for (const denied of [
    { ...env, NODE_ENV: "production" }, { ...env, NODE_ENV: "test" },
    { ...env, ADSTERRA_CUSTOM_BID_TEST_TARGET: undefined },
    { ...env, ADSTERRA_CUSTOM_BID_TEST_TARGET: "2:77:101,102" },
    { ...env, ADSTERRA_CUSTOM_BID_TEST_TARGET: "2:0:101" },
    { ...env, ADSTERRA_CUSTOM_BID_TEST_TARGET: "2:77:9007199254740992" },
    { ...env, RAILWAY_PROJECT_ID: "hosted" },
  ]) assert.equal(writeDomain.readAdsterraCustomBidExperiment(denied, "localhost:3000", "http://localhost:3000"), null);
  for (const [host, origin] of [
    ["example.com", "https://example.com"], ["localhost.evil.test", "http://localhost.evil.test"],
    ["localhost:3000", "https://evil.test"], ["localhost:3000", "http://localhost:3001"],
    ["localhost:3000", null], [null, "http://localhost:3000"],
  ]) assert.equal(writeDomain.readAdsterraCustomBidExperiment(env, host, origin), null);
});

test("experiment create still rejects a blacklisted target before POST", async () => {
  const f = fixture([], { experiment, blocked: [101] });
  await assert.rejects(writeAdsterraPlacementCustomBid(input("SAVE", 101, null, "0.015"), f.deps), /sedang dalam blacklist/);
  assert.equal(f.calls.some((x) => x[0] === "POST"), false);
});

test("blacklist race resets the experiment target without restoring any bid", async () => {
  const f = fixture([], { experiment, postWriteRace: true });
  await assert.rejects(writeAdsterraPlacementCustomBid(input("SAVE", 101, null, "0.015"), f.deps), /Blacklist berubah/);
  assert.deepEqual(f.actual(), []);
  assert.deepEqual(f.calls.find((x) => x[0] === "DELETE"), ["DELETE", "77", [{ placementId: "101", countryCode: "ID" }]]);
});

test("experiment never runs automatic bulk cleanup on other placements", async () => {
  const f = fixture([bid(102, "0.04", "US")], { experiment, additivePost: true, postWriteBlocked: [101, 102] });
  await assert.rejects(writeAdsterraPlacementCustomBid(input("SAVE", 101, null, "0.015"), f.deps), /tidak menjalankan reset otomatis pada Placement lain/);
  assert.equal(f.calls.some((x) => x[0] === "DELETE"), false);
});


test("explicit server rollout permits a single-item POST outside localhost without replaying bid snapshots", async () => {
  const f = fixture([bid(102, "0.04", "GLOBAL")], { allowCreate: true, additivePost: true });
  const result = await writeAdsterraPlacementCustomBid(input("SAVE", 101, null, "0.015"), f.deps);
  assert.equal(result.status, "UPDATED");
  assert.deepEqual(f.calls.filter((x) => x[0] === "POST"), [["POST", "77", [bid(101, "0.015", "ID")]]]);
  assert.equal(f.actual().find((x) => x.placementId === "102").price, "0.04");
});

test("create without explicit rollout remains fail-closed while existing edit and delete work", async () => {
  const f = fixture([bid(101, "0.02")]);
  await assert.rejects(writeAdsterraPlacementCustomBid(input("SAVE", 102, null, "0.015"), f.deps), /belum diaktifkan/);
  assert.equal((await writeAdsterraPlacementCustomBid(input("SAVE", 101, "0.02", "0.03"), f.deps)).status, "UPDATED");
  assert.equal((await writeAdsterraPlacementCustomBid(input("DELETE", 101, "0.03"), f.deps)).status, "UPDATED");
  assert.equal(f.calls.some((x) => x[0] === "POST"), false);
});
