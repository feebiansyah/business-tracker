import assert from "node:assert/strict";
import test from "node:test";

import {
  BlacklistReplacementError,
  buildCampaignBlacklistUpdate,
  normalizeZoneIds,
  replaceClickaduBlacklist,
  zoneSetsEqual,
} from "./blacklist.ts";
import { ClickaduAmbiguousWriteError, ClickaduApiError } from "./client.ts";

const campaign = {
  id: 123,
  name: "ROI campaign",
  direction: "mainstream",
  frequency: 1,
  capping: 2,
  freqCapType: "day",
  status: "paused",
  rateModel: "cpc",
  feed: 7,
  targetUrl: "https://example.test",
  rates: [{ rate: "0.1" }],
  dailyAmount: "10",
  targeting: {
    country: { list: ["ID"], isExcluded: false },
    browser: { list: ["Chrome"], isExcluded: false },
    zone: { list: ["1001", "1002", "1003"], isExcluded: true },
  },
  responseOnlyField: "must not be sent",
};

test("campaign update replaces rather than merges zones and preserves safe campaign fields", () => {
  const payload = buildCampaignBlacklistUpdate(campaign, ["1002", "1004", "1002"]);
  assert.deepEqual(payload.targeting.zone, { list: ["1002", "1004"], isExcluded: true });
  assert.deepEqual(payload.targeting.country, campaign.targeting.country);
  assert.deepEqual(payload.targeting.browser, campaign.targeting.browser);
  for (const field of ["name", "direction", "frequency", "capping", "freqCapType", "status", "rateModel", "feed", "targetUrl", "rates", "dailyAmount"]) {
    assert.deepEqual(payload[field], campaign[field]);
  }
  assert.equal("responseOnlyField" in payload, false);
  assert.equal("id" in payload, false);
});

test("empty candidates clear the zone blacklist", () => {
  assert.deepEqual(buildCampaignBlacklistUpdate(campaign, []).targeting.zone.list, []);
});

test("zone normalization deduplicates strings and exact comparison ignores order", () => {
  assert.deepEqual(normalizeZoneIds([1002, " 1004 ", "1002"]), ["1002", "1004"]);
  assert.equal(zoneSetsEqual(["1002", "1004"], ["1004", "1002"]), true);
  assert.equal(zoneSetsEqual(["1002", "1004"], ["1002", "1004", "1005"]), false);
  assert.equal(zoneSetsEqual(["1002", "1004"], ["1002"]), false);
});

function dependencies({ after = ["1004", "1002"], putError } = {}) {
  const calls = [];
  return {
    calls,
    deps: {
      getCampaign: async () => { calls.push("campaign"); return campaign; },
      getBlockedZones: async () => {
        calls.push("blocked");
        return calls.filter((call) => call === "blocked").length === 1 ? ["1001"] : after;
      },
      updateCampaign: async (_id, payload) => {
        calls.push(["put", payload]);
        if (putError) throw putError;
      },
    },
  };
}

test("replacement succeeds only after an exact post-write verification", async () => {
  const fixture = dependencies();
  const result = await replaceClickaduBlacklist("campaign-1", ["1002", "1004"], fixture.deps);
  assert.deepEqual(result, { blockedZoneCount: 2, candidateZoneIds: ["1002", "1004"] });
  assert.deepEqual(fixture.calls.map((call) => Array.isArray(call) ? call[0] : call), ["campaign", "blocked", "put", "blocked"]);
});

test("verification rejects extra and missing zones", async () => {
  await assert.rejects(replaceClickaduBlacklist("campaign-1", ["1002"], dependencies({ after: ["1002", "extra"] }).deps), /verifikasi/i);
  await assert.rejects(replaceClickaduBlacklist("campaign-1", ["1002", "1004"], dependencies({ after: ["1002"] }).deps), /verifikasi/i);
});

test("ordinary PUT HTTP failure is never reported as success", async () => {
  const fixture = dependencies({ putError: new ClickaduApiError("Request Clickadu gagal (HTTP 400).") });
  await assert.rejects(replaceClickaduBlacklist("campaign-1", ["1002"], fixture.deps), /HTTP 400/);
  assert.equal(fixture.calls.filter((call) => call === "blocked").length, 1);
});

test("ambiguous write is resolved by one read verification without a second PUT", async () => {
  const exact = dependencies({ after: ["1002"], putError: new ClickaduAmbiguousWriteError() });
  assert.equal((await replaceClickaduBlacklist("campaign-1", ["1002"], exact.deps)).blockedZoneCount, 1);
  assert.equal(exact.calls.filter((call) => Array.isArray(call) && call[0] === "put").length, 1);

  const mismatch = dependencies({ after: ["old"], putError: new ClickaduAmbiguousWriteError() });
  await assert.rejects(replaceClickaduBlacklist("campaign-1", ["1002"], mismatch.deps), BlacklistReplacementError);
  assert.equal(mismatch.calls.filter((call) => Array.isArray(call) && call[0] === "put").length, 1);
});
