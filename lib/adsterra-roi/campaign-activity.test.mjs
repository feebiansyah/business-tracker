import assert from "node:assert/strict";
import test from "node:test";

import { AdsterraAmbiguousWriteError } from "./client.ts";
import { setAndVerifyAdsterraCampaignActive } from "./campaign-activity.ts";

function status(activeCode, status) { return { campaignId: 77, activeCode, status }; }

test("verified ON and OFF return the GET-confirmed status", async () => {
  for (const [desired, actual] of [[true, status(3, "ACTIVE")], [false, status(1, "INACTIVE")]]) {
    let patches = 0;
    const result = await setAndVerifyAdsterraCampaignActive("77", desired, {
      setCampaignActive: async () => { patches += 1; },
      getCampaignStatus: async () => actual,
    }, { sleep: async () => {} });
    assert.equal(result.verified, true);
    assert.deepEqual(result.actual, actual);
    assert.equal(patches, 1);
  }
});

test("verification retries GET only and never repeats PATCH", async () => {
  let patches = 0; let gets = 0; const waits = [];
  const result = await setAndVerifyAdsterraCampaignActive("77", true, {
    setCampaignActive: async () => { patches += 1; },
    getCampaignStatus: async () => { gets += 1; return gets === 3 ? status(3, "ACTIVE") : status(1, "INACTIVE"); },
  }, { sleep: async (ms) => { waits.push(ms); } });
  assert.equal(result.verified, true);
  assert.equal(patches, 1);
  assert.equal(gets, 3);
  assert.deepEqual(waits, [500, 1000]);
});

test("wrong and limited actual states are not reported as verified ACTIVE", async () => {
  for (const actual of [status(1, "INACTIVE"), status(2, "LIMITED")]) {
    const result = await setAndVerifyAdsterraCampaignActive("77", true, {
      setCampaignActive: async () => {}, getCampaignStatus: async () => actual,
    }, { sleep: async () => {} });
    assert.equal(result.verified, false);
    assert.deepEqual(result.actual, actual);
  }
});

test("ambiguous PATCH verifies state without blind PATCH retry", async () => {
  let patches = 0;
  const result = await setAndVerifyAdsterraCampaignActive("77", true, {
    setCampaignActive: async () => { patches += 1; throw new AdsterraAmbiguousWriteError(); },
    getCampaignStatus: async () => status(3, "ACTIVE"),
  }, { sleep: async () => {} });
  assert.equal(result.verified, true);
  assert.equal(result.writeWasAmbiguous, true);
  assert.equal(patches, 1);
});
