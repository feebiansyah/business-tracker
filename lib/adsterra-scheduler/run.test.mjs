import assert from "node:assert/strict";
import test from "node:test";
import { runAdsterraScheduledCampaigns } from "./run.ts";

const status = (name) => ({ campaignId: 1, activeCode: { INACTIVE: 1, LIMITED: 2, ACTIVE: 3, NOT_IN_USE: 4 }[name], status: name });
const jakarta = (value) => new Date(`${value}+07:00`);

function harness(overrides = {}) {
  const configs = overrides.configs ?? [
    { id: 1, campaignId: "101", shopeeAccountId: 10 },
    { id: 2, campaignId: "102", shopeeAccountId: 10 },
  ];
  const claimed = overrides.claimed ?? new Set();
  const records = new Map();
  const calls = { load: 0, credentials: [], clients: [], gets: [], writes: [] };
  let nextId = 1;
  const deps = {
    loadEnabledConfigs: async () => { calls.load += 1; return configs; },
    claimRun: async (input) => {
      const key = `${input.adsterraCampaignConfigId}:${input.businessDate}:${input.action}`;
      if (claimed.has(key)) return null;
      claimed.add(key);
      const record = { id: nextId++, status: "RUNNING", ...input };
      records.set(record.id, record);
      return { id: record.id };
    },
    finishRun: async (input) => { records.set(input.id, { ...records.get(input.id), ...input }); },
    loadCredential: async (accountId) => { calls.credentials.push(accountId); return `encrypted-${accountId}`; },
    createClient: async (encrypted, accountId) => { calls.clients.push([encrypted, accountId]); return { accountId }; },
    getCampaignStatus: async (_client, campaignId) => { calls.gets.push(campaignId); return status(overrides.statuses?.[campaignId] ?? "INACTIVE"); },
    setAndVerify: async (_client, campaignId, desiredActive) => {
      calls.writes.push([campaignId, desiredActive]);
      return { verified: true, actual: status(desiredActive ? "ACTIVE" : "INACTIVE"), writeWasAmbiguous: false };
    },
    ...overrides.deps,
  };
  return { deps, calls, claimed, records };
}

test("ON pre-check skips ACTIVE and changes INACTIVE with one verified write", async () => {
  const h = harness({ statuses: { 101: "ACTIVE", 102: "INACTIVE" } });
  const result = await runAdsterraScheduledCampaigns("ON", { now: jakarta("2026-09-21T08:05:00") }, h.deps);
  assert.deepEqual(h.calls.writes, [["102", true]]);
  assert.deepEqual(result, { total: 2, success: 1, noChange: 1, skipped: 0, failed: 0, alreadyClaimed: 0, businessDate: "2026-09-21", details: [
    { configId: 1, campaignId: "101", status: "NO_CHANGE", actualStatus: "ACTIVE" },
    { configId: 2, campaignId: "102", status: "SUCCESS", actualStatus: "ACTIVE" },
  ] });
});

test("OFF pre-check skips INACTIVE and changes ACTIVE and LIMITED only when verified INACTIVE", async () => {
  const h = harness({
    configs: [
      { id: 1, campaignId: "101", shopeeAccountId: 10 },
      { id: 2, campaignId: "102", shopeeAccountId: 10 },
      { id: 3, campaignId: "103", shopeeAccountId: 10 },
    ],
    statuses: { 101: "INACTIVE", 102: "ACTIVE", 103: "LIMITED" },
  });
  const result = await runAdsterraScheduledCampaigns("OFF", { now: jakarta("2026-09-21T21:50:00") }, h.deps);
  assert.deepEqual(h.calls.writes, [["102", false], ["103", false]]);
  assert.equal(result.noChange, 1);
  assert.equal(result.success, 2);
  assert.equal(result.failed, 0);
});

test("NOT_IN_USE and a wrong verified final status are FAILED", async () => {
  const h = harness({
    statuses: { 101: "NOT_IN_USE", 102: "LIMITED" },
    deps: { setAndVerify: async () => ({ verified: false, actual: status("LIMITED"), writeWasAmbiguous: false }) },
  });
  const result = await runAdsterraScheduledCampaigns("ON", { now: jakarta("2026-09-21T08:05:00") }, h.deps);
  assert.equal(result.failed, 2);
  assert.deepEqual(result.details.map((item) => item.actualStatus), ["NOT_IN_USE", "LIMITED"]);
  assert.ok(result.details.every((item) => item.status === "FAILED"));
});

test("SUCCESS requires the exact desired final status even if a dependency reports verified", async () => {
  const h = harness({
    configs: [{ id: 1, campaignId: "101", shopeeAccountId: 10 }],
    statuses: { 101: "LIMITED" },
    deps: { setAndVerify: async () => ({ verified: true, actual: status("LIMITED"), writeWasAmbiguous: false }) },
  });
  const result = await runAdsterraScheduledCampaigns("OFF", { now: jakarta("2026-09-21T21:50:00") }, h.deps);
  assert.equal(result.success, 0);
  assert.equal(result.failed, 1);
});

test("special-date OFF claims enabled campaigns as skipped without credentials, GET, or PATCH", async () => {
  for (const value of ["2026-09-08T21:50:00", "2026-09-24T21:50:00"]) {
    const h = harness();
    const result = await runAdsterraScheduledCampaigns("OFF", { now: jakarta(value) }, h.deps);
    assert.equal(result.skipped, 2, value);
    assert.deepEqual(h.calls.credentials, [], value);
    assert.deepEqual(h.calls.gets, [], value);
    assert.deepEqual(h.calls.writes, [], value);
  }
});

test("ON still runs normally on a special-date evening", async () => {
  const h = harness({ statuses: { 101: "ACTIVE", 102: "ACTIVE" } });
  const result = await runAdsterraScheduledCampaigns("ON", { now: jakarta("2026-09-08T21:50:00") }, h.deps);
  assert.equal(result.noChange, 2);
  assert.deepEqual(h.calls.gets, ["101", "102"]);
});

test("duplicate and concurrent invocations cannot repeat provider operations", async () => {
  const claimed = new Set();
  const h = harness({ claimed, configs: [{ id: 1, campaignId: "101", shopeeAccountId: 10 }] });
  const [first, second] = await Promise.all([
    runAdsterraScheduledCampaigns("ON", { now: jakarta("2026-09-21T08:05:00") }, h.deps),
    runAdsterraScheduledCampaigns("ON", { now: jakarta("2026-09-21T08:05:00") }, h.deps),
  ]);
  assert.equal(h.calls.gets.length, 1);
  assert.equal(h.calls.writes.length, 1);
  assert.equal(first.alreadyClaimed + second.alreadyClaimed, 1);
  const repeated = await runAdsterraScheduledCampaigns("ON", { now: jakarta("2026-09-21T08:05:00") }, h.deps);
  assert.equal(repeated.alreadyClaimed, 1);
  assert.equal(h.calls.writes.length, 1);
});

test("credential is loaded and client is created once per Shopee account", async () => {
  const h = harness({ configs: [
    { id: 1, campaignId: "101", shopeeAccountId: 10 },
    { id: 2, campaignId: "102", shopeeAccountId: 10 },
    { id: 3, campaignId: "201", shopeeAccountId: 20 },
  ] });
  await runAdsterraScheduledCampaigns("ON", { now: jakarta("2026-09-21T08:05:00") }, h.deps);
  assert.deepEqual(h.calls.credentials, [10, 20]);
  assert.equal(h.calls.clients.length, 2);
});

test("missing credential fails one account but continues another", async () => {
  const h = harness({
    configs: [
      { id: 1, campaignId: "101", shopeeAccountId: 10 },
      { id: 2, campaignId: "201", shopeeAccountId: 20 },
    ],
    deps: { loadCredential: async (accountId) => accountId === 10 ? null : `encrypted-${accountId}` },
  });
  const result = await runAdsterraScheduledCampaigns("ON", { now: jakarta("2026-09-21T08:05:00") }, h.deps);
  assert.equal(result.failed, 1);
  assert.equal(result.success, 1);
  assert.deepEqual(h.calls.writes, [["201", true]]);
});

test("provider GET failure is isolated and stored errors never expose a secret", async () => {
  const h = harness({ deps: { getCampaignStatus: async (_client, campaignId) => { if (campaignId === "101") throw new Error("secret API-KEY-123 Authorization"); return status("INACTIVE"); } } });
  const result = await runAdsterraScheduledCampaigns("ON", { now: jakarta("2026-09-21T08:05:00") }, h.deps);
  assert.equal(result.failed, 1);
  assert.equal(result.success, 1);
  assert.doesNotMatch(JSON.stringify([...h.records.values()]), /secret|API-KEY-123|Authorization/);
  assert.doesNotMatch(JSON.stringify(result), /secret|API-KEY-123|Authorization/);
});

test("claim persistence failure is FAILED rather than already claimed and other campaigns continue", async () => {
  const h = harness({ deps: { claimRun: async (input) => { if (input.adsterraCampaignConfigId === 1) throw new Error("database detail"); return { id: input.adsterraCampaignConfigId }; } } });
  const result = await runAdsterraScheduledCampaigns("ON", { now: jakarta("2026-09-21T08:05:00") }, h.deps);
  assert.equal(result.failed, 1);
  assert.equal(result.alreadyClaimed, 0);
  assert.deepEqual(h.calls.writes, [["102", true]]);
  assert.doesNotMatch(JSON.stringify(result), /database detail/);
});

test("business date is derived from Asia/Jakarta rather than UTC", async () => {
  const h = harness({ statuses: { 101: "ACTIVE", 102: "ACTIVE" } });
  const result = await runAdsterraScheduledCampaigns("ON", { now: new Date("2026-09-21T17:30:00.000Z") }, h.deps);
  assert.equal(result.businessDate, "2026-09-22");
  assert.ok([...h.records.values()].every((record) => record.businessDate === "2026-09-22"));
});
