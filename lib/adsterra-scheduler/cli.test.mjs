import assert from "node:assert/strict";
import test from "node:test";

import { runAdsterraSchedulerCli } from "./cli.ts";

const summary = (overrides = {}) => ({
  businessDate: "2026-09-22",
  total: 2,
  success: 1,
  noChange: 1,
  skipped: 0,
  failed: 0,
  alreadyClaimed: 0,
  details: [],
  ...overrides,
});

test("CLI maps ON and OFF exactly once and prints only the sanitized summary", async () => {
  for (const action of ["ON", "OFF"]) {
    const calls = [];
    const logs = [];
    let disconnects = 0;

    const exitCode = await runAdsterraSchedulerCli(action, {
      run: async (received) => {
        calls.push(received);
        return summary({ details: [{ errorMessage: "secret API-KEY-123" }] });
      },
      disconnect: async () => { disconnects += 1; },
      log: (message) => logs.push(message),
    });

    assert.deepEqual(calls, [action]);
    assert.equal(disconnects, 1);
    assert.equal(exitCode, 0);
    assert.equal(logs.length, 1);
    assert.match(logs[0], new RegExp(`Action: ${action}`));
    assert.match(logs[0], /Business date: 2026-09-22/);
    assert.match(logs[0], /Total enabled: 2/);
    assert.doesNotMatch(logs[0], /secret|API-KEY|details/i);
  }
});

test("campaign failures are observable with exit 1 and still disconnect Prisma", async () => {
  const logs = [];
  let disconnects = 0;
  const exitCode = await runAdsterraSchedulerCli("OFF", {
    run: async () => summary({ failed: 1 }),
    disconnect: async () => { disconnects += 1; },
    log: (message) => logs.push(message),
  });

  assert.equal(exitCode, 1);
  assert.equal(disconnects, 1);
  assert.match(logs[0], /Failed: 1/);
});

test("fatal failures are sanitized and Prisma disconnects", async () => {
  const logs = [];
  let disconnects = 0;
  const exitCode = await runAdsterraSchedulerCli("ON", {
    run: async () => { throw new Error("DATABASE_URL=password API-KEY-123"); },
    disconnect: async () => { disconnects += 1; },
    log: (message) => logs.push(message),
  });

  assert.equal(exitCode, 1);
  assert.equal(disconnects, 1);
  assert.deepEqual(logs, ["Scheduler Adsterra gagal dijalankan."]);
});

test("disconnect failure is fatal without exposing its raw error", async () => {
  const logs = [];
  const exitCode = await runAdsterraSchedulerCli("ON", {
    run: async () => summary(),
    disconnect: async () => { throw new Error("secret disconnect password"); },
    log: (message) => logs.push(message),
  });

  assert.equal(exitCode, 1);
  assert.equal(logs.at(-1), "Koneksi database scheduler Adsterra gagal ditutup.");
  assert.doesNotMatch(logs.join("\n"), /secret|password/i);
});
