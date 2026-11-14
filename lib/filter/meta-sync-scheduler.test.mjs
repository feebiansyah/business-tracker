import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "./sync-baseline.test.mjs";

const progress = (status) => ({ runId: "run", status, targetDate: "2026-11-14", total: 1, current: 1, wlName: null, phase: null, summary: {}, message: null });

function harness({ terminal = new Set(), active = new Set(), batches = {} } = {}) {
  const calls = [], accounts = [{ id: 3, name: "C" }, { id: 1, name: "A" }, { id: 2, name: "B" }];
  const db = {
    shopeeAccount: { findMany: async () => accounts },
    metaSyncRun: {
      findUnique: async ({ where }) => active.has(where.activeShopeeAccountId) ? { id: `active-${where.activeShopeeAccountId}` } : null,
      findFirst: async ({ where }) => terminal.has(where.shopeeAccountId) ? { id: `done-${where.shopeeAccountId}`, status: "COMPLETE" } : null,
    },
  };
  const queues = new Map(Object.entries(batches).map(([id, values]) => [Number(id), [...values]]));
  const runBatch = async ({ shopeeAccountId }) => {
    calls.push(shopeeAccountId);
    const value = queues.get(shopeeAccountId)?.shift();
    if (value instanceof Error) throw value;
    return value ?? { progress: progress("COMPLETE"), blocked: false, paused: false, shouldContinue: false };
  };
  return { db, runBatch, calls };
}

test("scheduler processes ACTIVE Shopee accounts sequentially and skips today's terminal run", async () => {
  const api = loadTs("lib/filter/meta-sync-scheduler.ts");
  const h = harness({ terminal: new Set([2]), batches: {
    1: [{ progress: progress("RUNNING"), blocked: false, paused: false }, { progress: progress("PARTIAL"), blocked: false, paused: false }],
    3: [{ progress: progress("COMPLETE"), blocked: false, paused: false }],
  } });
  const result = await api.runScheduledMetaSyncs({ db: h.db, runBatch: h.runBatch, now: new Date("2026-11-14T01:00:00Z"), owner: id => `cron-${id}` });
  assert.deepEqual(h.calls, [1, 1, 3]);
  assert.deepEqual(result.accounts.map(row => [row.accountId, row.status]), [[1, "PARTIAL"], [2, "SKIPPED_ALREADY_SYNCED"], [3, "COMPLETE"]]);
});

test("busy account is skipped, deadline pause resumes, and account failure does not stop the queue", async () => {
  const api = loadTs("lib/filter/meta-sync-scheduler.ts");
  const h = harness({ batches: {
    1: [{ progress: progress("RUNNING"), blocked: true, paused: false }],
    2: [{ progress: progress("RUNNING"), blocked: false, paused: true }, { progress: progress("COMPLETE"), blocked: false, paused: false }],
    3: [new Error("one account failed")],
  } });
  const result = await api.runScheduledMetaSyncs({ db: h.db, runBatch: h.runBatch, now: new Date("2026-11-14T01:00:00Z"), owner: id => `cron-${id}` });
  assert.deepEqual(h.calls, [1, 2, 2, 3]);
  assert.deepEqual(result.accounts.map(row => row.status), ["SKIPPED_BUSY", "COMPLETE", "FAILED"]);
});

test("Meta rate limit stops the queue without retrying later accounts", async () => {
  const api = loadTs("lib/filter/meta-sync-scheduler.ts");
  const h = harness({ batches: { 1: [{ progress: progress("PAUSED_RATE_LIMIT"), blocked: false, paused: true }] } });
  const result = await api.runScheduledMetaSyncs({ db: h.db, runBatch: h.runBatch, now: new Date("2026-11-14T01:00:00Z"), owner: id => `cron-${id}` });
  assert.deepEqual(h.calls, [1]);
  assert.equal(result.stoppedByRateLimit, true);
  assert.deepEqual(result.accounts.map(row => row.status), ["PAUSED_RATE_LIMIT"]);
});

