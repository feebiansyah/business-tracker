import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { loadTs, day } from "./sync-baseline.test.mjs";

// In-memory Prisma boundary: atomic CAS, short serialized transactions, unique active identity.
export function stateDb(wls = [{ id: 1, name: "A", accountId: "100", shopeeAccountId: 7 }]) {
  const runs = new Map(), progress = new Map(); let tail = Promise.resolve(), serial = 0;
  const copy = value => structuredClone(value);
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some(part => matches(row, part));
    if (key === "AND") return value.every(part => matches(row, part));
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("in" in value) return value.in.includes(row[key]);
      if ("not" in value) return row[key] !== value.not;
      if ("gt" in value) return row[key] > value.gt;
      if ("lte" in value) return row[key] <= value.lte;
    }
    return row[key] instanceof Date && value instanceof Date ? +row[key] === +value : row[key] === value;
  });
  const model = (rows, defaults) => ({
    async findFirst(args = {}) { return (await this.findMany(args))[0] ?? null; },
    async findUnique(args) { return copy([...rows.values()].find(row => matches(row, args.where)) ?? null); },
    async findMany(args = {}) {
      let found = [...rows.values()].filter(row => matches(row, args.where));
      if (args.orderBy) for (const [key, dir] of Object.entries(args.orderBy)) found = found.sort((a,b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (dir === "desc" ? -1 : 1));
      return copy(args.take ? found.slice(0,args.take) : found);
    },
    async create(args) {
      if (args.data.activeShopeeAccountId != null && [...rows.values()].some(r => r.activeShopeeAccountId === args.data.activeShopeeAccountId)) throw Object.assign(new Error("unique"), { code: "P2002" });
      const row = { id: "id-" + ++serial, ...defaults, ...copy(args.data) }; rows.set(row.id, row); return copy(row);
    },
    async createMany(args) { for (const data of args.data) await this.create({ data }); return { count: args.data.length }; },
    async updateMany(args) {
      let count = 0;
      for (const row of rows.values()) if (matches(row, args.where)) {
        for (const [key, value] of Object.entries(args.data)) row[key] = value && typeof value === "object" && "increment" in value ? row[key] + value.increment : copy(value);
        count++;
      }
      return { count };
    },
    async update(args) { await this.updateMany(args); return this.findUnique({ where: args.where }); },
  });
  const db = {
    shopeeAccount: { findUnique: async args => args.where.id === 7 ? { id: 7, metaAccounts: copy(wls.filter(w => w.shopeeAccountId === 7)) } : null, update: async () => ({ id: 7 }) },
    metaSyncRun: model(runs, { leaseOwner: null, leaseExpiresAt: null, generation: 0, status: "RUNNING", summary: {}, error: null }),
    metaSyncWlProgress: model(progress, { phase: "STATUS", status: "PENDING", cursor: {}, error: null }),
    async $transaction(fn) {
      const previous = tail; let release; tail = new Promise(resolve => { release = resolve; }); await previous;
      const before = { runs: copy([...runs]), progress: copy([...progress]) };
      try { return await fn(db); } catch (error) { runs.clear(); progress.clear(); for (const row of before.runs) runs.set(...row); for (const row of before.progress) progress.set(...row); throw error; } finally { release(); }
    },
  };
  return { db, runs, progress };
}

if (path.basename(process.argv[1] ?? "") === "meta-sync-state.test.mjs") {
  test("concurrent starts create one ordered durable run with immutable target", async () => {
    const { db, runs, progress } = stateDb([{ id: 2, name: "B", accountId: "200", shopeeAccountId: 7 }, { id: 1, name: "A", accountId: "100", shopeeAccountId: 7 }]);
    const api = loadTs("lib/filter/meta-sync-state.ts");
    const now = day("2026-11-06");
    const [a,b] = await Promise.all([api.startOrResumeMetaSyncRun(db,7,"2026-11-06",now), api.startOrResumeMetaSyncRun(db,7,"2026-11-07",now)]);
    assert.equal(a.id,b.id); assert.equal(runs.size,1); assert.equal(progress.size,2);
    const fresh = await loadTs("lib/filter/meta-sync-state.ts").getMetaSyncProgress(db,7);
    assert.equal(fresh.targetDate,"2026-11-06"); assert.equal(fresh.total,2);
    assert.deepEqual([...progress.values()].sort((a,b) => a.position-b.position).map(p => p.metaAccountId),[1,2]);
  });
  test("fresh lease is exclusive, expiry reclaims with generation fencing, stale release fails", async () => {
    const { db } = stateDb(), api = loadTs("lib/filter/meta-sync-state.ts"), now = day("2026-11-06");
    const run = await api.startOrResumeMetaSyncRun(db,7,"2026-11-06",now);
    const [a,b] = await Promise.all([api.claimMetaSyncLease(db,run.id,"a",now), api.claimMetaSyncLease(db,run.id,"b",now)]);
    assert.equal([a,b].filter(Boolean).length,1);
    assert.equal(await api.claimMetaSyncLease(db,run.id,"c",new Date(+now+119999)),null);
    const newer = await api.claimMetaSyncLease(db,run.id,"c",new Date(+now+120001)); assert(newer.generation > (a??b).generation);
    await api.releaseMetaSyncLease(db,run.id,"a",(a??b).generation);
    assert.equal((await db.metaSyncRun.findUnique({ where: { id: run.id } })).leaseOwner,"c");
  });
  test("only all-terminal progress completes a run and releases active uniqueness", async () => {
    const { db } = stateDb(), api = loadTs("lib/filter/meta-sync-state.ts"), now = day("2026-11-06");
    const run = await api.startOrResumeMetaSyncRun(db,7,"2026-11-06",now);
    assert.equal(await api.completeMetaSyncRunIfTerminal(db,run.id,now),false);
    await db.metaSyncWlProgress.updateMany({ where: { runId: run.id }, data: { status: "FAILED", phase: "DONE" } });
    assert.equal(await api.completeMetaSyncRunIfTerminal(db,run.id,now),true);
    assert.equal((await db.metaSyncRun.findUnique({ where: { id: run.id } })).status,"PARTIAL");
    const next = await api.startOrResumeMetaSyncRun(db,7,"2026-11-07",now); assert.notEqual(next.id,run.id);
  });
}
