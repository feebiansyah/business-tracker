import assert from "node:assert/strict";
import test from "node:test";
import { AdsterraApiError, AdsterraClient } from "./client.ts";
import { loadAdsterraCustomBids, placementCustomBids } from "./custom-bids.ts";

const input = [
  { placement_id: 101, price: 0.012345, country_code: "ID" },
  { placement_id: 101, price: 0.00001, country_code: "GLOBAL" },
  { placement_id: 102, price: 0, country_code: "GLOBAL" },
  { placement_id: 103, price: 0.03, country_code: "US" },
];

test("Custom Bid GET uses the campaign endpoint, header auth and no write/body", async () => {
  const calls = [];
  const client = new AdsterraClient({ apiKey: "test-secret", fetchImpl: async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json({ items: input, itemCount: 4 });
  } });
  assert.deepEqual(await client.getCustomBids("77"), [
    { placementId: "101", price: "0.012345", countryCode: "ID" },
    { placementId: "101", price: "0.00001", countryCode: "GLOBAL" },
    { placementId: "102", price: "0", countryCode: "GLOBAL" },
    { placementId: "103", price: "0.03", countryCode: "US" },
  ]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api3.adsterratools.com/advertiser/campaign/77/custom_bid.json");
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.headers["X-API-Key"], "test-secret");
  assert.equal(calls[0].options.cache, "no-store");
  assert.equal(calls[0].options.body, undefined);
});

for (const [name, body] of [
  ["missing items", {}],
  ["invalid items", { items: null, itemCount: 0 }],
  ["missing itemCount", { items: [] }],
  ["incomplete collection", { items: [], itemCount: 1 }],
  ["negative placement", { items: [{ ...input[0], placement_id: -1 }], itemCount: 1 }],
  ["unsafe placement", { items: [{ ...input[0], placement_id: Number.MAX_SAFE_INTEGER + 1 }], itemCount: 1 }],
  ["missing price", { items: [{ placement_id: 1, country_code: "ID" }], itemCount: 1 }],
  ["negative price", { items: [{ ...input[0], price: -1 }], itemCount: 1 }],
  ["null price", { items: [{ ...input[0], price: null }], itemCount: 1 }],
  ["missing GEO", { items: [{ placement_id: 1, price: 0.1 }], itemCount: 1 }],
  ["unknown GLOBAL representation", { items: [{ ...input[0], country_code: "" }], itemCount: 1 }],
  ["duplicate identity", { items: [input[0], input[0]], itemCount: 2 }],
]) {
  test(`Custom Bid rejects ${name} rather than claiming no override`, async () => {
    const client = new AdsterraClient({ apiKey: "test-secret", fetchImpl: async () => Response.json(body) });
    await assert.rejects(client.getCustomBids("77"), AdsterraApiError);
  });
}

test("Custom Bid GET handles a genuinely empty collection", async () => {
  const client = new AdsterraClient({ apiKey: "test-secret", fetchImpl: async () => Response.json({ items: [], itemCount: 0 }) });
  assert.deepEqual(await client.getCustomBids("77"), []);
});

test("invalid campaign identity is rejected before Custom Bid GET", async () => {
  const client = new AdsterraClient({ apiKey: "test-secret", fetchImpl: async () => assert.fail("must not request an invalid campaign") });
  await assert.rejects(client.getCustomBids("77/other-campaign"), AdsterraApiError);
});

test("Custom Bid GET errors stay errors and never expose credentials or provider body", async () => {
  for (const fetchImpl of [
    async () => new Response("test-secret provider detail", { status: 403 }),
    async () => { throw new Error("test-secret network detail"); },
    async () => new Response("test-secret invalid JSON", { status: 200 }),
  ]) {
    const client = new AdsterraClient({ apiKey: "test-secret", fetchImpl });
    await assert.rejects(client.getCustomBids("77"), (error) => {
      assert.ok(error instanceof AdsterraApiError);
      assert.doesNotMatch(error.message, /test-secret|provider detail|network detail/);
      return true;
    });
  }
});

test("Custom Bid scope uses stored campaign and only the owning Shopee credential", async () => {
  const calls = [];
  const result = await loadAdsterraCustomBids(2, 7, {
    loadConfig: async (accountId, configId) => {
      calls.push(["config", accountId, configId]);
      return { id: 7, shopeeAccountId: 2, campaignId: "77" };
    },
    loadClient: async (accountId) => {
      calls.push(["credential", accountId]);
      return { getCustomBids: async (campaignId) => { calls.push(["GET", campaignId]); return [{ placementId: "101", price: "0.012345", countryCode: "ID" }]; } };
    },
  });
  assert.deepEqual(calls, [["config", 2, 7], ["credential", 2], ["GET", "77"]]);
  assert.deepEqual(result, [{ placementId: "101", price: "0.012345", countryCode: "ID" }]);
});

test("cross-account or missing config never loads credential or calls provider", async () => {
  for (const config of [null, { id: 7, shopeeAccountId: 3, campaignId: "77" }]) {
    await assert.rejects(loadAdsterraCustomBids(2, 7, {
      loadConfig: async () => config,
      loadClient: async () => { assert.fail("must not load another account credential"); },
    }), /tidak ditemukan/);
  }
});

test("credential failure propagates instead of becoming an empty override collection", async () => {
  await assert.rejects(loadAdsterraCustomBids(2, 7, {
    loadConfig: async () => ({ id: 7, shopeeAccountId: 2, campaignId: "77" }),
    loadClient: async () => { throw new AdsterraApiError("Koneksi Adsterra belum dikonfigurasi."); },
  }), /Koneksi Adsterra belum dikonfigurasi/);
});

test("Indonesia and GLOBAL bids remain distinct for the same placement", () => {
  const bids = [
    { placementId: "101", price: "0.012345", countryCode: "ID" },
    { placementId: "101", price: "0.02", countryCode: "GLOBAL" },
    { placementId: "102", price: "0", countryCode: "GLOBAL" },
    { placementId: "103", price: "0.03", countryCode: "US" },
  ];
  assert.deepEqual(placementCustomBids(bids, "101"), { indonesia: "0.012345", global: "0.02" });
  assert.deepEqual(placementCustomBids(bids, "102"), { indonesia: null, global: "0" });
  assert.deepEqual(placementCustomBids(bids, "103"), { indonesia: null, global: null });
  assert.deepEqual(placementCustomBids(bids, "104"), { indonesia: null, global: null });
  assert.deepEqual(placementCustomBids([bids[0]], "00101"), { indonesia: "0.012345", global: null });
});
