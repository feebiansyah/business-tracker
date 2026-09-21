import assert from "node:assert/strict";
import test from "node:test";

import { AdsterraAmbiguousWriteError, AdsterraApiError, AdsterraClient } from "./client.ts";

test("Adsterra campaign status maps active codes and ignores deprecated activity", async () => {
  const bodies = [
    { id: 77, active: 1, activity: 3 },
    { id: 77, active: 2 },
    { id: 77, active: 3 },
    { id: 77, active: 4 },
  ];
  const client = new AdsterraClient({ apiKey: "placeholder-key", fetchImpl: async () => Response.json(bodies.shift()) });
  assert.equal((await client.getCampaignStatus("77")).status, "INACTIVE");
  assert.equal((await client.getCampaignStatus("77")).status, "LIMITED");
  assert.equal((await client.getCampaignStatus("77")).status, "ACTIVE");
  assert.equal((await client.getCampaignStatus("77")).status, "NOT_IN_USE");
});

test("Adsterra campaign status rejects malformed active codes", async () => {
  for (const active of [0, 5, "3", null, undefined]) {
    const client = new AdsterraClient({ apiKey: "placeholder-key", fetchImpl: async () => Response.json(active === undefined ? {} : { active }) });
    await assert.rejects(client.getCampaignStatus("77"), AdsterraApiError);
  }
});

test("Adsterra campaign PATCH sends only the exact active boolean body", async () => {
  const requests = [];
  const client = new AdsterraClient({ apiKey: "placeholder-key", fetchImpl: async (input, init) => {
    requests.push({ url: String(input), init });
    return Response.json({ activity: 999 });
  } });
  await client.setCampaignActive("77", true);
  await client.setCampaignActive("77", false);
  assert.deepEqual(JSON.parse(requests[0].init.body), { active: true });
  assert.deepEqual(JSON.parse(requests[1].init.body), { active: false });
  assert.equal(requests[0].init.method, "PATCH");
  assert.equal(requests[0].init.headers.Accept, "application/json");
  assert.equal(requests[0].init.headers["Content-Type"], "application/json");
  assert.match(requests[0].url, /\/advertiser\/campaign\/77\.json$/);
});

test("network failure during campaign PATCH is ambiguous and never retried", async () => {
  let calls = 0;
  const client = new AdsterraClient({ apiKey: "placeholder-key", fetchImpl: async () => { calls += 1; throw new Error("timeout placeholder-key"); } });
  await assert.rejects(client.setCampaignActive("77", true), (error) => {
    assert.ok(error instanceof AdsterraAmbiguousWriteError);
    assert.doesNotMatch(error.message, /placeholder-key/);
    return true;
  });
  assert.equal(calls, 1);
});

test("Adsterra client requests placement statistics and normalizes IDs", async () => {
  const requests = [];
  const client = new AdsterraClient({ apiKey: "placeholder-key", fetchImpl: async (input, init) => {
    requests.push({ url: new URL(input), init });
    return Response.json({ items: [
      { placement: 12345, impressions: 100, clicks: 7, spent: "1.25" },
      { placement: " 0099 ", impressions: 10, clicks: 1, spent: 0 },
    ], itemCount: 2, timezone: "UTC" });
  }});
  const rows = await client.getPlacementStatistics({ campaignId: "77", dateFrom: "2026-09-01", dateTill: "2026-09-14" });
  assert.deepEqual(rows.map(({ placement, spent }) => ({ placement, spent })), [{ placement: "12345", spent: "1.25" }, { placement: "0099", spent: "0" }]);
  assert.equal(requests[0].url.href, "https://api3.adsterratools.com/advertiser/stats.json?start_date=2026-09-01&finish_date=2026-09-14&group_by%5B%5D=placement&campaign=77");
  assert.equal(requests[0].init.headers["X-API-Key"], "placeholder-key");
  assert.equal(requests[0].init.method, "GET");
});

test("Adsterra errors are sanitized and never expose API key", async () => {
  const client = new AdsterraClient({ apiKey: "placeholder-key", fetchImpl: async () => new Response("secret", { status: 401 }) });
  await assert.rejects(client.getPlacementStatistics({ campaignId: "77", dateFrom: "2026-09-01", dateTill: "2026-09-14" }), (error) => {
    assert.ok(error instanceof AdsterraApiError);
    assert.match(error.message, /HTTP 401/);
    assert.doesNotMatch(error.message, /placeholder-key|secret/);
    return true;
  });
});

test("Adsterra blacklist parser supports documented and legitimate empty shapes", async () => {
  const bodies = [{ placement_ids: [15413270, "15413272"] }, { placement_ids: [] }, []];
  const client = new AdsterraClient({ apiKey: "placeholder-key", fetchImpl: async () => bodies.length ? Response.json(bodies.shift()) : new Response(null, { status: 204 }) });
  assert.deepEqual(await client.getBlacklist("1463724"), [15413270, 15413272]);
  assert.deepEqual(await client.getBlacklist("1463724"), []);
  assert.deepEqual(await client.getBlacklist("1463724"), []);
  assert.deepEqual(await client.getBlacklist("1463724"), []);
});

test("Adsterra blacklist rejects malformed responses and invalid IDs", async () => {
  const client = new AdsterraClient({ apiKey: "placeholder-key", fetchImpl: async () => Response.json({}) });
  await assert.rejects(client.getBlacklist("1463724"), /respons.*tidak valid/i);
  await assert.rejects(client.replaceBlacklist("1463724", ["not-an-id"]), /placement/i);
});

test("Adsterra replace sends integer placement IDs and empty lists", async () => {
  const requests = [];
  const client = new AdsterraClient({ apiKey: "placeholder-key", fetchImpl: async (_input, init) => {
    requests.push(init);
    return Response.json({ placement_ids: [] });
  }});
  await client.replaceBlacklist("1463724", [15413270, "15413272", 15413270]);
  await client.replaceBlacklist("1463724", []);
  assert.deepEqual(JSON.parse(requests[0].body), { campaign_id: 1463724, placement_ids: [15413270, 15413272] });
  assert.deepEqual(JSON.parse(requests[1].body), { campaign_id: 1463724, placement_ids: [] });
  assert.equal(requests[0].method, "PUT");
});

test("network failure during PUT is ambiguous and never retried", async () => {
  let calls = 0;
  const client = new AdsterraClient({ apiKey: "placeholder-key", fetchImpl: async () => { calls += 1; throw new Error("timeout"); } });
  await assert.rejects(client.replaceBlacklist("1463724", [1]), AdsterraAmbiguousWriteError);
  assert.equal(calls, 1);
});
