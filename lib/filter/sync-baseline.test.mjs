import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { Script } from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
export const Decimal = require("decimal.js");
export const root = fileURLToPath(new URL("../../", import.meta.url));
export const day = value => new Date(value + "T00:00:00Z");
export const fixedNow = "2026-11-06T05:00:00Z";
export const baselineSha = "56dd9aa7ff7267b2fb4d6afc1f624a59ba0d8585";

export function loadTs(relative, stubs = {}, baseline = false) {
  const cache = new Map();
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [fixedNow])); } static now() { return Date.parse(fixedNow); } }
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const loaded = { exports: {} }; cache.set(file, loaded);
    const source = baseline
      ? execFileSync("git", ["show", baselineSha + ":" + path.relative(root, file).replaceAll("\\", "/")], { cwd: root, encoding: "utf8" })
      : readFileSync(file, "utf8");
    const code = ts.transpileModule(source, { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const localRequire = name => {
      if (Object.hasOwn(stubs, name)) return stubs[name];
      if (name === "server-only") return {};
      if (name.includes("generated/prisma/client")) return { Prisma: { Decimal } };
      if (name.startsWith("@/") || name.startsWith(".")) {
        const resolved = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(file), name);
        return load(/\.(ts|tsx)$/.test(resolved) ? resolved : resolved + ".ts");
      }
      return require(name);
    };
    new Script("(function(require,module,exports,Date){" + code + "\n})", { filename: file }).runInThisContext()(localRequire, loaded, loaded.exports, stubs.__date ?? Clock);
    return loaded.exports;
  }
  return load(path.join(root, relative));
}

export function domainHarness({ inactive = false, unavailable, adSetBudget = false, checkpoint = "2026-11-05", start = "2026-03-03", count = 1 } = {}) {
  const events = [], metrics = new Map(), spends = new Map(), snapshots = new Map();
  const wls = Array.from({ length: count }, (_, index) => ({ id: index + 1, name: "WL " + (index + 1), accountId: String(100 + index), status: "ACTIVE", shopeeAccountId: 7, spendHistorySyncedThrough: checkpoint ? day(checkpoint) : null }));
  const campaigns = new Map(wls.map(w => ["meta-" + w.accountId, { id: w.id, metaAccountId: w.id, metaCampaignId: "meta-" + w.accountId, name: "Campaign", startTime: day(start), historySyncedThrough: checkpoint ? day(checkpoint) : null, effectiveDailyBudget: new Decimal(500000), budgetSource: "CAMPAIGN", metaStatus: "ACTIVE", effectiveStatus: "ACTIVE" }]));
  for (const c of campaigns.values()) metrics.set(c.id + ":2026-11-05", { campaignId: c.id, date: day("2026-11-05"), note: "manual", completed: true, commission: "99", shopeeClicks: 8, spend: "1" });
  const lazy = (name, args, fn) => ({ then(resolve, reject) { return Promise.resolve().then(() => { events.push({ name, args }); return fn(); }).then(resolve, reject); } });
  const db = {
    shopeeAccount: { findUnique: args => lazy("account.read", args, () => ({ id: 7, metaAccounts: wls })), update: args => lazy("account.update", args, () => ({ id: 7 })) },
    metaAccount: { findFirst: args => lazy("wl.read", args, () => wls.find(w => w.id === args.where.id && w.shopeeAccountId === args.where.shopeeAccountId) ?? null), update: args => lazy("wl.update", args, () => Object.assign(wls.find(w => w.id === args.where.id), args.data)) },
    campaign: {
      findMany: args => lazy("campaign.readMany", args, () => [...campaigns.values()].filter(c => c.metaAccountId === args.where.metaAccountId)),
      upsert: args => lazy("campaign.upsert", args, () => {
        const old = campaigns.get(args.where.metaCampaignId);
        const data = old ? args.update : args.create;
        const stored = { ...(old ?? { id: campaigns.size + 1, historySyncedThrough: null }), ...data, effectiveDailyBudget: data.effectiveDailyBudget === null ? null : new Decimal(data.effectiveDailyBudget) };
        campaigns.set(stored.metaCampaignId, stored); return stored;
      }),
      updateMany: args => lazy("campaign.checkpoint", args, () => {
        for (const c of campaigns.values()) if (args.where.id.in.includes(c.id) && (!c.historySyncedThrough || c.historySyncedThrough < args.data.historySyncedThrough)) c.historySyncedThrough = args.data.historySyncedThrough;
        return { count: args.where.id.in.length };
      }),
    },
    campaignDailyMetric: { upsert: args => lazy("metric.upsert", args, () => { const key = args.where.campaignId_date.campaignId + ":" + args.where.campaignId_date.date.toISOString().slice(0, 10); const old = metrics.get(key); const row = old ? { ...old, ...args.update } : args.create; metrics.set(key, row); return row; }) },
    metaAccountDailySpend: { upsert: args => lazy("spend.upsert", args, () => { const key = args.where.metaAccountId_date.metaAccountId + ":" + args.where.metaAccountId_date.date.toISOString().slice(0, 10); spends.set(key, args.update); return args.update; }) },
    campaignDailyBudgetSnapshot: { upsert: args => lazy("budget.upsert", args, () => { snapshots.set(args.where.campaignId_date.campaignId + ":" + args.where.campaignId_date.date.toISOString().slice(0, 10), args.update); return args.update; }) },
    $transaction: async fn => typeof fn === "function" ? fn(db) : Promise.all(fn),
  };
  class MetaApiError extends Error { constructor(message, code) { super(message); this.code = code; } }
  const data = id => [{ id: "meta-" + id, name: "Campaign", start_time: start + "T00:00:00Z", status: "ACTIVE", effective_status: "ACTIVE", ...(adSetBudget ? {} : { daily_budget: "500000" }) }];
  const read = (name, id, range, value) => { events.push({ name, id, range }); return value; };
  class Client {
    async getAdAccountStatus(id) { if (unavailable) { read("status", id); throw new MetaApiError("access", unavailable); } return read("status", id, undefined, inactive ? 2 : 1); }
    async getCampaigns(id) { return read("campaigns", id, undefined, data(id)); }
    async getAdSets(id) { return read("adSets", id, undefined, adSetBudget ? [{ id: "set1", campaign_id: "meta-" + id, daily_budget: "200000" }, { id: "set2", campaign_id: "meta-" + id, daily_budget: "300000" }] : []); }
    async getAccountDailySpend(id, range) { return read("spend", id, range, [{ date_start: range.until, date_stop: range.until, spend: "12.00" }]); }
    async getCampaignInsights(id, range) { return read("insights", id, range, [{ campaign_id: "meta-" + id, date_start: range.until, date_stop: range.until, spend: "30.00", inline_link_clicks: "20", cost_per_inline_link_click: "1.5" }]); }
    async waitBetweenAccounts() { read("wait"); }
  }
  const stubs = { "@/lib/prisma": { prisma: db }, "@/lib/meta/client": { MetaGraphClient: Client, MetaApiError } };
  return { db, events, wls, campaigns, metrics, spends, snapshots, Client, MetaApiError, stubs, load: (file, baseline = false) => loadTs(file, stubs, baseline) };
}

if (path.basename(process.argv[1] ?? "") === "sync-baseline.test.mjs") {
  test("baseline ACTIVE preserves Jakarta overlap, budgets, status, manual fields and summary", async () => {
    for (const adSetBudget of [false, true]) {
      const h = domainHarness({ adSetBudget });
      const summary = await h.load("lib/filter/sync.ts", true).syncFilter(7);
      assert.deepEqual(h.events.filter(e => e.range).map(e => e.range), [{ since: "2026-11-05", until: "2026-11-06" }, { since: "2026-11-05", until: "2026-11-06" }]);
      assert.equal(summary.wlSucceeded, 1); assert.equal(summary.campaignsProcessed, 1); assert.equal(summary.insightRowsStored, 1);
      const c = h.campaigns.get("meta-100");
      assert.equal(c.effectiveDailyBudget.toString(), "500000"); assert.equal(c.budgetSource, adSetBudget ? "ADSET" : "CAMPAIGN");
      assert.equal(c.metaStatus, "ACTIVE"); assert.equal(c.effectiveStatus, "ACTIVE");
      assert.equal(h.metrics.get("1:2026-11-05").note, "manual"); assert.equal(h.metrics.get("1:2026-11-05").completed, true);
      assert.equal(h.snapshots.size, 1);
    }
  });
  test("baseline initial history starts in March, monthly, while INACTIVE ends yesterday without snapshots", async () => {
    for (const inactive of [false, true]) {
      const h = domainHarness({ inactive, checkpoint: null });
      const summary = await h.load("lib/filter/sync.ts", true).syncFilter(7);
      const ranges = h.events.filter(e => e.name === "insights").map(e => e.range);
      assert.equal(ranges.length, 9); assert.equal(ranges[0].since, "2026-03-03"); assert.equal(ranges.at(-1).until, inactive ? "2026-11-05" : "2026-11-06");
      assert.equal(h.snapshots.size, inactive ? 0 : 1); assert.equal(summary.wlSkipped, inactive ? 1 : 0);
      assert.equal(h.wls[0].status, inactive ? "INACTIVE" : "ACTIVE");
    }
  });
  test("baseline access 10/100/200 remains UNAVAILABLE without metadata/history", async () => {
    for (const unavailable of [10,100,200]) {
      const h = domainHarness({ unavailable }); const summary = await h.load("lib/filter/sync.ts", true).syncFilter(7);
      assert.equal(h.wls[0].status, "UNAVAILABLE"); assert.equal(summary.wlSkipped, 1);
      assert.deepEqual(h.events.filter(e => ["status","campaigns","spend","insights"].includes(e.name)).map(e => e.name), ["status"]);
    }
  });
}
