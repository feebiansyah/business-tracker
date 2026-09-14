import assert from "node:assert/strict";
import test from "node:test";

import { ClickaduApiError, ClickaduClient } from "./client.ts";

const token = "test-token-placeholder";

function clickaduPage(page, totalPages, items) {
  return {
    result: {
      page,
      items,
      perPage: 100,
      totalPages,
      totals: { impressions: 30, conversions: 3, spent: 4.5 },
    },
  };
}

function statistic(zone, spent) {
  return {
    impressions: 10,
    clicks: 4,
    conversions: 1,
    conversionsClicks: 1,
    cpa: 1.5,
    cpc: 0.375,
    cpm: 150,
    ctr: 40,
    cr: 25,
    spent,
    zone,
  };
}

test("Clickadu statistics starts at page 1 and combines every response page", async () => {
  const requests = [];
  const fetchImpl = async (input, init) => {
    const url = new URL(input);
    requests.push({ url, init });
    const page = Number(url.searchParams.get("page"));
    return Response.json(
      page === 1
        ? clickaduPage(1, 2, [statistic(2101219, 1.25)])
        : clickaduPage(2, 2, [statistic("00123", 3.25)]),
    );
  };

  const client = new ClickaduClient({ token, fetchImpl });
  const items = await client.getZoneStatistics({
    campaignIds: ["campaign-42"],
    dateFrom: "2026-09-01",
    dateTill: "2026-09-14",
  });

  assert.equal(requests.length, 2);
  assert.deepEqual(
    requests.map(({ url }) => url.searchParams.get("page")),
    ["1", "2"],
  );
  for (const { url, init } of requests) {
    assert.equal(url.origin + url.pathname, "https://ssp.clickadu.com/v1.0/api/client/statistics/");
    assert.equal(url.searchParams.get("dateFrom"), "2026-09-01");
    assert.equal(url.searchParams.get("dateTill"), "2026-09-14");
    assert.equal(url.searchParams.get("groupBy"), "zone");
    assert.deepEqual(url.searchParams.getAll("campaignId[]"), ["campaign-42"]);
    assert.equal(url.searchParams.get("limit"), "100");
    assert.equal(url.searchParams.get("withTestExpenses"), "0");
    assert.equal(init.headers.Authorization, token);
    assert.equal(init.cache, "no-store");
  }
  assert.deepEqual(
    items.map(({ zone, spent }) => ({ zone, spent })),
    [
      { zone: "2101219", spent: "1.25" },
      { zone: "00123", spent: "3.25" },
    ],
  );
});
test("Clickadu HTTP errors are clear and never expose token or response details", async () => {
  const responseSecret = "upstream-secret-details";
  const client = new ClickaduClient({
    token,
    fetchImpl: async () => new Response(responseSecret, { status: 503 }),
  });

  await assert.rejects(
    client.getZoneStatistics({
      campaignIds: ["campaign-42"],
      dateFrom: "2026-09-01",
      dateTill: "2026-09-14",
    }),
    (error) => {
      assert.ok(error instanceof ClickaduApiError);
      assert.match(error.message, /HTTP 503/);
      assert.doesNotMatch(error.message, new RegExp(token));
      assert.doesNotMatch(error.message, new RegExp(responseSecret));
      return true;
    },
  );
});
