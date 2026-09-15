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

test("Clickadu statistics ignores summary rows without a zone", async () => {
  const summaryWithNullZone = { ...statistic(123, 9), zone: null };
  const summaryWithEmptyZone = { ...statistic(123, 8), zone: "   " };
  const client = new ClickaduClient({
    token,
    fetchImpl: async () => Response.json(clickaduPage(1, 1, [
      summaryWithNullZone,
      statistic("2101219", 1.25),
      summaryWithEmptyZone,
    ])),
  });

  const items = await client.getZoneStatistics({
    campaignIds: ["campaign-42"],
    dateFrom: "2026-09-01",
    dateTill: "2026-09-14",
  });

  assert.deepEqual(items.map(({ zone, spent }) => ({ zone, spent })), [
    { zone: "2101219", spent: "1.25" },
  ]);
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

test("Clickadu retries a rate-limited page and succeeds", async () => {
  let attempts = 0;
  const sleeps = [];
  const client = new ClickaduClient({
    token,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) return new Response(null, { status: 429 });
      return Response.json(clickaduPage(1, 1, [statistic(2101219, 1.25)]));
    },
    sleepImpl: async (milliseconds) => sleeps.push(milliseconds),
  });

  const items = await client.getZoneStatistics({
    campaignIds: ["campaign-42"],
    dateFrom: "2026-09-01",
    dateTill: "2026-09-14",
  });

  assert.equal(attempts, 2);
  assert.deepEqual(sleeps, [500]);
  assert.equal(items[0].zone, "2101219");
});

test("Clickadu stops after three rate-limit attempts with a sanitized error", async () => {
  let attempts = 0;
  const sleeps = [];
  const client = new ClickaduClient({
    token,
    fetchImpl: async () => {
      attempts += 1;
      return new Response("secret upstream details", { status: 429 });
    },
    sleepImpl: async (milliseconds) => sleeps.push(milliseconds),
  });

  await assert.rejects(
    client.getZoneStatistics({
      campaignIds: ["campaign-42"],
      dateFrom: "2026-09-01",
      dateTill: "2026-09-14",
    }),
    (error) => {
      assert.ok(error instanceof ClickaduApiError);
      assert.equal(error.message, "Rate limit Clickadu tercapai. Coba lagi beberapa saat.");
      assert.doesNotMatch(error.message, new RegExp(token));
      assert.doesNotMatch(error.message, /secret upstream details/);
      return true;
    },
  );
  assert.equal(attempts, 3);
  assert.deepEqual(sleeps, [500, 1_000]);
});

test("Clickadu honors Retry-After and bounds an excessive delay", async () => {
  let attempts = 0;
  const sleeps = [];
  const client = new ClickaduClient({
    token,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) {
        return new Response(null, { status: 429, headers: { "Retry-After": "9999" } });
      }
      return Response.json(clickaduPage(1, 1, []));
    },
    sleepImpl: async (milliseconds) => sleeps.push(milliseconds),
  });

  await client.getZoneStatistics({
    campaignIds: ["campaign-42"],
    dateFrom: "2026-09-01",
    dateTill: "2026-09-14",
  });

  assert.deepEqual(sleeps, [10_000]);
});

test("Clickadu does not retry non-rate-limit HTTP errors", async () => {
  let attempts = 0;
  const client = new ClickaduClient({
    token,
    fetchImpl: async () => {
      attempts += 1;
      return new Response(null, { status: 401 });
    },
    sleepImpl: async () => assert.fail("401 must not sleep or retry"),
  });

  await assert.rejects(
    client.getZoneStatistics({
      campaignIds: ["campaign-42"],
      dateFrom: "2026-09-01",
      dateTill: "2026-09-14",
    }),
    /HTTP 401/,
  );
  assert.equal(attempts, 1);
});

test("Clickadu pagination remains sequential", async () => {
  let activeRequests = 0;
  let maximumActiveRequests = 0;
  const client = new ClickaduClient({
    token,
    fetchImpl: async (input) => {
      activeRequests += 1;
      maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
      await Promise.resolve();
      const page = Number(new URL(input).searchParams.get("page"));
      activeRequests -= 1;
      return Response.json(clickaduPage(page, 3, [statistic(page, page)]));
    },
    sleepImpl: async () => {},
  });

  const items = await client.getZoneStatistics({
    campaignIds: ["campaign-42"],
    dateFrom: "2026-09-01",
    dateTill: "2026-09-14",
  });

  assert.equal(maximumActiveRequests, 1);
  assert.deepEqual(items.map((item) => item.zone), ["1", "2", "3"]);
});

test("Clickadu campaign operations use proven read and write endpoints with one PUT", async () => {
  const requests = [];
  const client = new ClickaduClient({
    token,
    fetchImpl: async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith("/blocked/zone/")) return Response.json({ result: { items: [{ zone: 1004 }, { id: "1002" }] } });
      if (init.method === "PUT") return Response.json({ result: { updated: true } });
      return Response.json({ result: { name: "Campaign", targeting: {} } });
    },
  });

  assert.equal((await client.getCampaign("campaign-42")).name, "Campaign");
  assert.deepEqual(await client.getBlockedZones("campaign-42"), ["1004", "1002"]);
  await client.updateCampaign("campaign-42", { name: "Campaign", targeting: { zone: { list: [], isExcluded: true } } });

  assert.deepEqual(requests.map(({ url, init }) => [url, init.method]), [
    ["https://ssp.clickadu.com/api/v2/campaigns/campaign-42/", "GET"],
    ["https://ssp.clickadu.com/v1.0/api/client/campaigns/campaign-42/blocked/zone/", "GET"],
    ["https://ssp.clickadu.com/api/v2/campaigns/campaign-42/", "PUT"],
  ]);
  assert.equal(requests.filter(({ init }) => init.method === "PUT").length, 1);
});

test("Clickadu campaign PUT HTTP failure is sanitized and never retried", async () => {
  let requests = 0;
  const client = new ClickaduClient({ token, fetchImpl: async () => { requests += 1; return new Response("sensitive", { status: 403 }); } });
  await assert.rejects(client.updateCampaign("campaign-42", { name: "Campaign" }), (error) => {
    assert.match(error.message, /HTTP 403/);
    assert.doesNotMatch(error.message, /sensitive|test-token/);
    return true;
  });
  assert.equal(requests, 1);
});
