import assert from "node:assert/strict";
import test from "node:test";

import { handleAdsterraSchedulerRequest } from "./http-handler.ts";

const SECRET = "cron-secret-for-tests";
const summary = (overrides = {}) => ({
  businessDate: "2026-09-22",
  total: 2,
  success: 1,
  noChange: 1,
  skipped: 0,
  failed: 0,
  alreadyClaimed: 0,
  details: [{ errorMessage: "must not be returned" }],
  ...overrides,
});

function request(body, authorization = `Bearer ${SECRET}`) {
  return new Request("http://localhost/api/internal/adsterra-scheduler", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorization ? { authorization } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function dependencies(overrides = {}) {
  const calls = [];
  return {
    calls,
    value: {
      cronSecret: SECRET,
      run: async (action) => { calls.push(action); return summary(); },
      ...overrides,
    },
  };
}

test("missing configured secret returns 503 without running", async () => {
  const deps = dependencies({ cronSecret: undefined });
  const response = await handleAdsterraSchedulerRequest(request({ action: "ON" }), deps.value);
  assert.equal(response.status, 503);
  assert.deepEqual(deps.calls, []);
});

test("missing or wrong bearer secret returns 401 without running", async () => {
  for (const authorization of [null, "Basic abc", "Bearer wrong-secret"]) {
    const deps = dependencies();
    const response = await handleAdsterraSchedulerRequest(request({ action: "ON" }, authorization), deps.value);
    assert.equal(response.status, 401);
    assert.deepEqual(deps.calls, []);
    assert.doesNotMatch(await response.text(), new RegExp(SECRET));
  }
});

test("invalid JSON and actions return 400 without running", async () => {
  for (const body of ["{", {}, { action: "START" }, { action: null }]) {
    const deps = dependencies();
    const response = await handleAdsterraSchedulerRequest(request(body), deps.value);
    assert.equal(response.status, 400);
    assert.deepEqual(deps.calls, []);
  }
});

test("valid ON and OFF run exactly once and return a sanitized 200 summary", async () => {
  for (const action of ["ON", "OFF"]) {
    const deps = dependencies();
    const response = await handleAdsterraSchedulerRequest(request({ action }), deps.value);
    assert.equal(response.status, 200);
    assert.deepEqual(deps.calls, [action]);
    assert.deepEqual(await response.json(), {
      action,
      businessDate: "2026-09-22",
      total: 2,
      success: 1,
      noChange: 1,
      skipped: 0,
      failed: 0,
      alreadyClaimed: 0,
    });
  }
});

test("completed runner with campaign failures returns sanitized 207", async () => {
  const deps = dependencies({ run: async (action) => { deps.calls.push(action); return summary({ failed: 1 }); } });
  const response = await handleAdsterraSchedulerRequest(request({ action: "OFF" }), deps.value);
  assert.equal(response.status, 207);
  const body = await response.text();
  assert.match(body, /"failed":1/);
  assert.doesNotMatch(body, /details|must not be returned/);
});

test("fatal runner errors return generic 500 without leaking exception data", async () => {
  const deps = dependencies({ run: async () => { throw new Error("DATABASE_URL=password API-KEY-secret"); } });
  const response = await handleAdsterraSchedulerRequest(request({ action: "ON" }), deps.value);
  assert.equal(response.status, 500);
  const body = await response.text();
  assert.match(body, /Scheduler Adsterra gagal dijalankan/);
  assert.doesNotMatch(body, /DATABASE_URL|password|API-KEY|secret/i);
});
