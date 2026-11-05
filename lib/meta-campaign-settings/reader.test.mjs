import assert from "node:assert/strict";
import test from "node:test";
import { MetaCampaignReadClient } from "../meta-campaign-controls/read-client.ts";
import { readMetaCampaignSettings } from "./reader.ts";

test("settings client sends GET to fixed edge with fixed fields", async () => {
  let observed;
  const fetchImpl = async (url, init) => {
    observed = { url: new URL(url), init };
    return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const client = new MetaCampaignReadClient({ apiVersion: "v24.0", accessToken: "secret", appSecret: "proof-secret" }, fetchImpl);
  await client.readSettingsPage("123", "adsets");
  assert.equal(observed.init.method, "GET");
  assert.equal(observed.url.pathname, "/v24.0/123/adsets");
  assert.equal(observed.url.searchParams.get("fields"), "id,name,campaign_id,created_time,configured_status,effective_status,targeting");
  assert.equal(observed.url.searchParams.has("access_token"), false);
});

test("reader follows only validated cursors and compares all pages", async () => {
  const calls = [];
  const client = {
    readSettingsPage: async (_id, edge, after) => {
      calls.push([edge, after ?? null]);
      if (edge === "adsets" && !after) return { data: [{ id: "1", campaign_id: "9", created_time: "2026-01-01", targeting: {} }], paging: { next: "ignored", cursors: { after: "NEXT" } } };
      if (edge === "adsets") return { data: [{ id: "2", campaign_id: "9", created_time: "2026-01-02", targeting: { age_min: 21 } }] };
      return { data: [{ id: "3", campaign_id: "9", adset_id: "1", creative: { object_type: "VIDEO" } }] };
    },
    page(payload) { return new MetaCampaignReadClient({ apiVersion: "v24.0", accessToken: "x" }).page(payload); },
    claimObject() {}, safeText(value) { return value; },
  };
  const result = await readMetaCampaignSettings("9", client);
  assert.deepEqual(calls, [["adsets", null], ["adsets", "NEXT"], ["ads", null]]);
  assert.equal(result.adSetCount, 2);
  assert.equal(result.reference.contentType, "Video");
});

test("one failed edge yields visible partial data and never equality", async () => {
  const client = {
    async readSettingsPage(_id, edge) { if (edge === "ads") throw new Error("token=secret https://graph.facebook.com/x"); return { data: [{ id: "1", campaign_id: "9", targeting: {} }] }; },
    page(payload) { return { rows: payload.data, after: null }; }, claimObject() {},
    safeText() { return "Respons iklan gagal dibaca."; },
  };
  const result = await readMetaCampaignSettings("9", client);
  assert.equal(result.partial, true);
  assert.equal(result.sameAcrossAll, false);
  assert.deepEqual(result.warnings, ["Respons iklan gagal dibaca."]);
});

test("campaign membership mismatch fails closed instead of returning partial data", async () => {
  const client = {
    async readSettingsPage() { return { data: [{ id: "1", campaign_id: "OTHER", targeting: {} }] }; },
    page(payload) { return { rows: payload.data, after: null }; }, claimObject() {}, safeText(value) { return value; },
  };
  await assert.rejects(() => readMetaCampaignSettings("9", client), /di luar campaign/);
});
