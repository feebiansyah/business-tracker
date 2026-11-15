import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "../filter/sync-baseline.test.mjs";

const api = () => loadTs("lib/meta-prefilter/scheduler.ts");
const result = (status, extra = {}) => ({ progress: { runId: "saved-run", slot: "AWAL", businessDate: "2026-11-15", requestedAt: "2026-11-15T02:34:12Z", status, current: 1, total: 1, pages: 1, skipped: [], message: null }, shouldContinue: false, blocked: false, ...extra });
function harness(queue = []) {
  const calls = [], logs = [];
  let instant = new Date("2026-11-15T02:34:12Z");
  const db = { shopeeAccount: { findMany: async args => { assert.deepEqual(args, { where: { status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { id: "asc" } }); return [{ id: 7, name: "Shop" }, { id: 8, name: "Next" }]; } } };
  const runBatch = async input => { calls.push(input); const next = queue.shift() ?? result("COMPLETE", { progress: { ...result("COMPLETE").progress, slot: input.slot } }); if (next instanceof Error) throw next; return next; };
  return { calls, logs, advance: ms => { instant = new Date(+instant + ms); }, options: { db, runBatch, now: () => new Date(instant), log: value => logs.push(value) } };
}

for (const slot of ["AWAL", "AKHIR"]) test(`${slot}: sequential ACTIVE accounts, actual timestamp and WIB business date`, async () => {
  const h = harness();
  const value = await api().runScheduledPrefilter({ ...h.options, slot });
  assert.deepEqual(h.calls.map(c => c.shopeeAccountId), [7, 8]);
  assert(h.calls.every(c => c.slot === slot && c.skipCompleted === true && c.receivedAt.toISOString() === "2026-11-15T02:34:12.000Z"));
  assert.equal(value.businessDate, "2026-11-15");
  assert.equal(value.success, true);
  assert.equal(h.logs.length, 2);
});

test("RUNNING with shouldContinue=false resumes the same run, not a replacement", async () => {
  const h = harness([result("RUNNING"), result("RUNNING", { progress: { ...result("RUNNING").progress, pages: 2 } }), result("COMPLETE")]);
  await api().runScheduledPrefilter({ ...h.options, slot: "AWAL" });
  assert.deepEqual(h.calls.slice(0, 3).map(c => c.runId), [undefined, "saved-run", "saved-run"]);
  assert.equal(h.calls[3].runId, undefined);
});

test("manual lease collision is skipped without taking the other slot", async () => {
  const h = harness([result("RUNNING", { blocked: true, progress: { ...result("RUNNING").progress, slot: "AKHIR" } })]);
  const value = await api().runScheduledPrefilter({ ...h.options, slot: "AWAL" });
  assert.equal(value.accounts[0].status, "SKIPPED_BUSY");
  assert.equal(value.success, false);
  assert.deepEqual(h.calls.map(c => [c.shopeeAccountId, c.slot]), [[7, "AWAL"], [8, "AWAL"]]);
});

test("rate limit stops the queue without retry; partial/failure are never success", async () => {
  const h = harness([result("PAUSED_RATE_LIMIT")]);
  const value = await api().runScheduledPrefilter({ ...h.options, slot: "AWAL" });
  assert.equal(h.calls.length, 1); assert.equal(value.success, false);
  assert.equal(value.accounts[0].status, "PAUSED_RATE_LIMIT");
  for (const status of ["PARTIAL", "FAILED", "EXPIRED"]) {
    const f = harness([result(status, { progress: { ...result(status).progress, slot: "AKHIR" } })]);
    const r = await api().runScheduledPrefilter({ ...f.options, slot: "AKHIR" });
    assert.equal(r.accounts[0].status, status); assert.equal(r.success, false);
    assert.equal(f.calls.filter(c => c.shopeeAccountId === 7).length, 1);
  }
});

test("exceptions are sanitized and later accounts still run", async () => {
  const h = harness([new Error("token=secret")]);
  const r = await api().runScheduledPrefilter({ ...h.options, slot: "AWAL" });
  assert.equal(r.accounts[0].status, "FAILED"); assert.equal(h.calls.length, 2);
  assert.doesNotMatch(JSON.stringify(r) + JSON.stringify(h.logs), /secret/);
});

test("bounded units stop without discarding saved progress", async () => {
  const h = harness([result("RUNNING"), result("RUNNING"), result("RUNNING")]);
  const r = await api().runScheduledPrefilter({ ...h.options, slot: "AWAL", maxBatchesPerAccount: 2 });
  assert.equal(r.accounts[0].status, "LIMIT_REACHED"); assert.equal(r.success, false);
  assert.equal(h.calls.filter(c => c.shopeeAccountId === 7).length, 2);
});

test("WIB midnight stops before another batch can create a different day's run", async () => {
  const h = harness(); h.advance(Date.parse("2026-11-15T16:59:59Z") - Date.parse("2026-11-15T02:34:12Z"));
  const runBatch = async input => { h.calls.push(input); h.advance(2000); return result("RUNNING"); };
  const r = await api().runScheduledPrefilter({ ...h.options, runBatch, slot: "AWAL" });
  assert.equal(h.calls.length, 1); assert.equal(r.success, false);
  assert.equal(r.accounts[0].status, "EXPIRED");
});

test("total runner deadline prevents new units and invalid slots make no DB reads", async () => {
  const h = harness();
  const r = await api().runScheduledPrefilter({ ...h.options, slot: "AWAL", maxDurationMs: 0 });
  assert.equal(h.calls.length, 0); assert.equal(r.success, false);
  await assert.rejects(() => api().runScheduledPrefilter({ ...h.options, slot: "INVALID" }));
});

test("CLI forwards either slot to the service runner, reports failure and always disconnects", async () => {
  const originalArgs = process.argv, originalExit = process.exitCode;
  const originalLog = console.log, originalError = console.error;
  try {
    for (const [slot, success] of [["AWAL", true], ["AKHIR", false], ["INVALID", false]]) {
      let resolve, calls = 0;
      const done = new Promise(r => { resolve = r; }), messages = [];
      process.argv = ["node", "scheduler", slot]; process.exitCode = undefined;
      console.log = value => messages.push(value); console.error = value => messages.push(value);
      const db = { $disconnect: async () => { resolve(); } }, runBatch = () => {};
      loadTs("scripts/run-meta-prefilter-scheduler.ts", {
        "../lib/prisma": { prisma: db },
        "../lib/meta-prefilter/service": { runPrefilterBatch: runBatch },
        "../lib/meta-prefilter/scheduler": { runScheduledPrefilter: async input => {
          calls++; assert.equal(input.db, db); assert.equal(input.runBatch, runBatch); assert.equal(input.slot, slot);
          return { success, accounts: [] };
        } },
      });
      await done;
      assert.equal(calls, slot === "INVALID" ? 0 : 1);
      assert.equal(process.exitCode, success ? undefined : 1);
      assert(messages.length > 0);
    }
  } finally {
    process.argv = originalArgs; process.exitCode = originalExit;
    console.log = originalLog; console.error = originalError;
  }
});
