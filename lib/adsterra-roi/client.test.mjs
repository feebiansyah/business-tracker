import assert from "node:assert/strict";
import test from "node:test";

import { AdsterraApiError, AdsterraClient } from "./client.ts";

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
