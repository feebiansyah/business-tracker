import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const Decimal = require("decimal.js");
const base = fileURLToPath(new URL("../../", import.meta.url));
const instant = "2026-09-15T05:00:00.000Z";
const day = (value) => new Date(value + "T00:00:00.000Z");
const wl = (overrides = {}) => ({ id: 1, name: "WL same name", accountId: "111", status: "ACTIVE", spendHistorySyncedThrough: day("2026-09-14"), ...overrides });
const campaign = (overrides = {}) => ({ id: 10, metaCampaignId: "meta-111", metaAccountId: 1, name: "Same campaign name", startTime: day("2026-09-13"), historySyncedThrough: day("2026-09-14"), metaStatus: "ACTIVE", effectiveStatus: "ACTIVE", effectiveDailyBudget: new Decimal(100000), budgetSource: "CAMPAIGN", ...overrides });
const apiCampaign = (overrides = {}) => ({ id: "meta-111", name: "Same campaign name", start_time: "2026-09-13T00:00:00Z", status: "PAUSED", effective_status: "ACCOUNT_DISABLED", daily_budget: "500000", ...overrides });
const insight = (overrides = {}) => ({ campaign_id: "meta-111", date_start: "2026-09-14", date_stop: "2026-09-14", spend: "30.00", inline_link_clicks: "20", cost_per_inline_link_click: "1.5", ...overrides });

function harness(options = {}) {
  const events = [];
  const state = {
    wls: options.wls ?? [wl()],
    campaigns: new Map((options.campaigns ?? [campaign()]).map(row => [row.metaCampaignId, row])),
    metrics: new Map([["10:2026-09-14", { campaignId: 10, date: day("2026-09-14"), spend: "10", commission: "99", shopeeClicks: 8, note: "keep", completed: true }]]),
    spends: new Map([["1:2026-09-14", { spend: new Decimal(10) }]]),
    snapshots: new Map([["10:2026-09-14", { dailyBudget: 100000 }]]),
  };
  let serial = 20;
  const log = (kind, args) => events.push({ kind, args: JSON.parse(JSON.stringify(args ?? {})) });
  const operation = (kind, args, body) => ({
    then(resolve, reject) {
      return Promise.resolve().then(() => {
        log(kind, args);
        if (options.failWrite === kind) throw new Error("mock DB persist failure");
        return body();
      }).then(resolve, reject);
    },
  });
  const db = {
    shopeeAccount: {
      findUnique: args => operation("db.account.read", args, () => ({ id: 7, metaAccounts: state.wls.map(row => ({ ...row })) })),
      update: args => operation("db.account.finish", args, () => ({ id: 7 })),
    },
    metaAccount: {
      update: args => operation("db.wl.update", args, () => {
        const index = state.wls.findIndex(row => row.id === args.where.id);
        state.wls[index] = { ...state.wls[index], ...args.data };
        return state.wls[index];
      }),
    },
    campaign: {
      findMany: args => operation("db.campaigns.read", args, () => [...state.campaigns.values()].filter(row => row.metaAccountId === args.where.metaAccountId).map(row => ({ ...row }))),
      upsert: args => operation("db.campaign.upsert", args, () => {
        const old = state.campaigns.get(args.where.metaCampaignId);
        const data = old ? args.update : args.create;
        const row = { ...(old ?? { id: ++serial, historySyncedThrough: null }), ...data, effectiveDailyBudget: data.effectiveDailyBudget === null ? null : new Decimal(data.effectiveDailyBudget) };
        state.campaigns.set(row.metaCampaignId, row);
        return { ...row };
      }),
      updateMany: args => operation("db.campaign.checkpoint", args, () => {
        for (const [key, row] of state.campaigns) {
          if (args.where.id.in.includes(row.id) && (!row.historySyncedThrough || row.historySyncedThrough < args.data.historySyncedThrough)) state.campaigns.set(key, { ...row, ...args.data });
        }
        return { count: args.where.id.in.length };
      }),
    },
    campaignDailyMetric: {
      upsert: args => operation("db.metric.upsert", args, () => {
        const key = args.where.campaignId_date.campaignId + ":" + args.where.campaignId_date.date.toISOString().slice(0, 10);
        const old = state.metrics.get(key);
        const row = old ? { ...old, ...args.update } : args.create;
        state.metrics.set(key, row);
        return row;
      }),
    },
    metaAccountDailySpend: {
      upsert: args => operation("db.spend.upsert", args, () => {
        const key = args.where.metaAccountId_date.metaAccountId + ":" + args.where.metaAccountId_date.date.toISOString().slice(0, 10);
        state.spends.set(key, { ...(state.spends.get(key) ?? args.create), ...args.update });
        return state.spends.get(key);
      }),
    },
    campaignDailyBudgetSnapshot: {
      upsert: args => operation("db.budget.snapshot", args, () => {
        const key = args.where.campaignId_date.campaignId + ":" + args.where.campaignId_date.date.toISOString().slice(0, 10);
        state.snapshots.set(key, args.update);
        return args.update;
      }),
    },
    async $transaction(body) {
      const before = { wls: state.wls.map(row => ({ ...row })), campaigns: new Map(state.campaigns), metrics: new Map(state.metrics), spends: new Map(state.spends), snapshots: new Map(state.snapshots) };
      log("db.transaction.begin");
      try {
        const result = typeof body === "function" ? await body(db) : await Promise.all(body);
        log("db.transaction.commit");
        return result;
      } catch (error) {
        Object.assign(state, before);
        log("db.transaction.rollback");
        throw error;
      }
    },
  };
  class MetaApiError extends Error {
    constructor(message, code) { super(message); this.code = code; }
  }
  const payloads = options.payloads ?? {
    "111": { status: 2, campaigns: [apiCampaign()], adSets: [], spend: [{ date_start: "2026-09-14", date_stop: "2026-09-14", spend: "30.00" }], insights: [insight()] },
  };
  class MetaGraphClient {
    call(endpoint, accountId, range) {
      log("GET." + endpoint, { accountId, ...(range ? { range } : {}) });
      const payload = payloads[accountId];
      if (!payload) throw new Error("unexpected account ID");
      if (payload.fail === endpoint) throw new MetaApiError("mock read denied", payload.code ?? 200);
      if (endpoint === "status") {
        if (payload.statusError) throw new MetaApiError("mock account access denied", payload.statusError);
        return payload.status;
      }
      const result = payload[endpoint];
      return range ? result.filter(row => row.date_start >= range.since && row.date_start <= range.until) : result;
    }
    async getAdAccountStatus(id) { return this.call("status", id); }
    async getCampaigns(id) { return this.call("campaigns", id); }
    async getAdSets(id) { return this.call("adSets", id); }
    async getAccountDailySpend(id, range) { return this.call("spend", id, range); }
    async getCampaignInsights(id, range) { return this.call("insights", id, range); }
    async waitBetweenAccounts() { log("WAIT"); }
  }
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [instant])); }
    static now() { return new Date(instant).getTime(); }
  }
  const modules = new Map();
  function load(file) {
    if (modules.has(file)) return modules.get(file).exports;
    const loadedModule = { exports: {} };
    modules.set(file, loadedModule);
    const source = file === path.join(base, "lib/filter/sync.ts") && options.baseline
      ? execFileSync("git", ["show", "9cf467895eb52355c9fb42e455afe19865c4b3fc:lib/filter/sync.ts"], { cwd: base, encoding: "utf8" })
      : readFileSync(file, "utf8");
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const localRequire = request => {
      if (request === "server-only") return {};
      if (request === "@/lib/prisma") return { prisma: db };
      if (request === "@/lib/meta/client") return { MetaApiError, MetaGraphClient };
      if (request.includes("generated/prisma/client")) return { Prisma: { Decimal } };
      if (request.startsWith("@/") || request.startsWith(".")) {
        let resolved = request.startsWith("@/") ? path.join(base, request.slice(2)) : path.resolve(path.dirname(file), request);
        if (!resolved.endsWith(".ts")) resolved += ".ts";
        return load(resolved);
      }
      return require(request);
    };
    new Script("(function(exports,require,module,__filename,__dirname,Date,console){" + code + "\n})", { filename: file }).runInThisContext()(loadedModule.exports, localRequire, loadedModule, file, path.dirname(file), Clock, { ...console, error: (...args) => log("ERROR", { message: String(args[0]) }) });
    return loadedModule.exports;
  }
  const sync = load(path.join(base, "lib/filter/sync.ts"));
  return { state, events, payloads, run: () => sync.syncFilter(7), calls: () => events.filter(row => row.kind.startsWith("GET.")) };
}

test("ACTIVE preserves baseline requests, DB writes, checkpoints, budgets and summary exactly", async () => {
  const payloads = { "111": { status: 1, campaigns: [apiCampaign()], adSets: [], spend: [{ date_start: "2026-09-14", spend: "30.00" }], insights: [insight()] } };
  const before = harness({ baseline: true, payloads });
  const after = harness({ payloads });
  assert.deepEqual(await after.run(), await before.run());
  assert.deepEqual(after.events, before.events);
  const snapshot = value => JSON.parse(JSON.stringify(value, (_key, item) => item instanceof Map ? [...item] : item));
  assert.deepEqual(snapshot(after.state), snapshot(before.state));
  assert.deepEqual(after.calls().map(row => row.kind), ["GET.status", "GET.campaigns", "GET.adSets", "GET.spend", "GET.insights"]);
  assert.deepEqual(after.calls().at(-1).args.range, { since: "2026-09-14", until: "2026-09-15" });
});

test("INACTIVE corrects yesterday's partial spend/insights via upsert without budget backfill", async () => {
  const h = harness();
  const summary = await h.run();
  assert.equal(h.state.wls[0].status, "INACTIVE");
  assert.equal(summary.wlSucceeded, 0);
  assert.equal(summary.wlSkipped, 1);
  assert.equal(summary.wlFailed, 0);
  assert.equal(summary.insightRowsStored, 1);
  assert.equal(h.state.metrics.size, 1);
  assert.equal(h.state.spends.size, 1);
  assert.equal(h.state.metrics.get("10:2026-09-14").spend, "30.00");
  assert.equal(h.state.spends.get("1:2026-09-14").spend.toString(), "30");
  assert.equal(h.state.metrics.get("10:2026-09-14").note, "keep");
  assert.equal(h.state.metrics.get("10:2026-09-14").commission, "99");
  assert.equal(h.state.campaigns.get("meta-111").effectiveDailyBudget.toString(), "500000");
  assert.deepEqual([...h.state.snapshots], [["10:2026-09-14", { dailyBudget: 100000 }]]);
  assert.equal(h.events.filter(row => row.kind === "db.campaigns.read").length, 1);
  assert.equal(h.calls()[0].kind, "GET.status");
  assert.deepEqual(h.calls().map(row => row.kind), ["GET.status", "GET.campaigns", "GET.spend", "GET.insights"]);
  for (const call of h.calls().filter(row => row.args.range)) assert.deepEqual(call.args.range, { since: "2026-09-14", until: "2026-09-14" });
});

test("INACTIVE with checkpoint yesterday or today only rolls yesterday and never regresses coverage", async () => {
  for (const checkpoint of ["2026-09-14", "2026-09-15"]) {
    const h = harness({ wls: [wl({ status: "INACTIVE", spendHistorySyncedThrough: day(checkpoint) })], campaigns: [campaign({ historySyncedThrough: day(checkpoint) })] });
    await h.run();
    for (const call of h.calls().filter(row => row.args.range)) assert.deepEqual(call.args.range, { since: "2026-09-14", until: "2026-09-14" });
    assert.equal(h.calls().filter(row => row.args.range).length, 2);
    assert.equal(h.state.wls[0].spendHistorySyncedThrough.toISOString().slice(0, 10), checkpoint);
    assert.equal(h.state.campaigns.get("meta-111").historySyncedThrough.toISOString().slice(0, 10), checkpoint);
  }
});

test("INACTIVE catches up monthly from existing checkpoint, advancing only after successful chunks", async () => {
  const h = harness({ wls: [wl({ spendHistorySyncedThrough: day("2026-08-30") })], campaigns: [campaign({ historySyncedThrough: day("2026-08-30") })] });
  await h.run();
  assert.deepEqual(h.calls().filter(row => row.kind === "GET.spend").map(row => row.args.range), [{ since: "2026-08-30", until: "2026-08-31" }, { since: "2026-09-01", until: "2026-09-14" }]);
  assert.deepEqual(h.calls().filter(row => row.kind === "GET.insights").map(row => row.args.range), [{ since: "2026-08-30", until: "2026-08-31" }, { since: "2026-09-01", until: "2026-09-14" }]);
  assert.equal(h.calls().length, 6);
  assert.equal(h.state.wls[0].spendHistorySyncedThrough.toISOString().slice(0, 10), "2026-09-14");
  assert.equal(h.state.campaigns.get("meta-111").historySyncedThrough.toISOString().slice(0, 10), "2026-09-14");
  assert(h.events.findIndex(e => e.kind === "db.metric.upsert") < h.events.findLastIndex(e => e.kind === "db.campaign.checkpoint"));
});

test("INACTIVE discovers new campaigns by Meta ID, not by their identical names", async () => {
  const h = harness();
  h.payloads["111"].campaigns.push(apiCampaign({ id: "new-meta-id", start_time: "2026-09-14T01:00:00Z" }));
  h.payloads["111"].insights.push(insight({ campaign_id: "new-meta-id", spend: "12" }));
  await h.run();
  assert.equal(h.state.campaigns.size, 2);
  const created = h.state.campaigns.get("new-meta-id");
  assert.equal(created.name, h.state.campaigns.get("meta-111").name);
  assert.equal(h.state.metrics.get(created.id + ":2026-09-14").spend, "12");
  assert.equal(h.events.filter(e => e.kind === "db.campaigns.read").length, 1);
  assert.equal(h.calls().filter(e => e.kind === "GET.insights").length, 1);
});

test("INACTIVE reads Ad Sets only for unresolved campaign budget and creates no historical snapshot", async () => {
  const h = harness();
  h.payloads["111"].campaigns[0].daily_budget = undefined;
  h.payloads["111"].adSets = [{ id: "set-1", campaign_id: "meta-111", daily_budget: "200000" }, { id: "set-2", campaign_id: "meta-111", daily_budget: "300000" }];
  await h.run();
  assert.equal(h.calls().filter(row => row.kind === "GET.adSets").length, 1);
  assert.equal(h.state.campaigns.get("meta-111").budgetSource, "ADSET");
  assert.equal(h.state.campaigns.get("meta-111").effectiveDailyBudget.toString(), "500000");
  assert.equal(h.events.filter(row => row.kind === "db.budget.snapshot").length, 0);
});

test("unresolved current budget does not erase or block INACTIVE historical insights", async () => {
  const h = harness();
  h.payloads["111"].campaigns[0].daily_budget = undefined;
  await h.run();
  assert.equal(h.state.campaigns.get("meta-111").effectiveDailyBudget, null);
  assert.equal(h.state.metrics.get("10:2026-09-14").spend, "30.00");
  assert.equal(h.state.snapshots.size, 1);
});

test("INACTIVE read rejection preserves old data/checkpoint and continues to next WL with existing pacing", async () => {
  const h = harness({
    wls: [wl({ spendHistorySyncedThrough: day("2026-09-13") }), wl({ id: 2, accountId: "222", spendHistorySyncedThrough: day("2026-09-14") })],
    campaigns: [campaign({ historySyncedThrough: day("2026-09-13") })],
    payloads: {
      "111": { status: 2, campaigns: [apiCampaign()], adSets: [], spend: [], insights: [], fail: "spend" },
      "222": { status: 1, campaigns: [], adSets: [], spend: [], insights: [] },
    },
  });
  const summary = await h.run();
  assert.equal(h.state.wls[0].status, "INACTIVE");
  assert.equal(h.state.wls[0].spendHistorySyncedThrough.toISOString().slice(0, 10), "2026-09-13");
  assert.equal(h.state.campaigns.get("meta-111").historySyncedThrough.toISOString().slice(0, 10), "2026-09-13");
  assert.equal(h.state.metrics.get("10:2026-09-14").spend, "10");
  assert.equal(summary.wlFailed, 1);
  assert.equal(summary.wlSucceeded, 1);
  assert.equal(h.calls().filter(row => row.kind === "GET.spend" && row.args.accountId === "111").length, 1);
  assert.equal(h.events.filter(row => row.kind === "WAIT").length, 1);
});

test("failed INACTIVE insight persist does not advance campaign coverage or retry a DB write", async () => {
  const h = harness({ failWrite: "db.metric.upsert", campaigns: [campaign({ historySyncedThrough: day("2026-09-13") })] });
  const summary = await h.run();
  assert.equal(summary.wlFailed, 1);
  assert.equal(h.state.campaigns.get("meta-111").historySyncedThrough.toISOString().slice(0, 10), "2026-09-13");
  assert.equal(h.state.metrics.get("10:2026-09-14").spend, "10");
  assert.equal(h.events.filter(e => e.kind === "db.metric.upsert").length, 1);
  assert.equal(h.events.filter(e => e.kind === "db.campaign.checkpoint").length, 0);
});

test("INACTIVE insight GET rejection retains campaign data and coverage after successful spend persist", async () => {
  const h = harness({ campaigns: [campaign({ historySyncedThrough: day("2026-09-13") })] });
  h.payloads["111"].fail = "insights";
  const summary = await h.run();
  assert.equal(summary.wlFailed, 1);
  assert.equal(h.state.wls[0].status, "INACTIVE");
  assert.equal(h.state.spends.get("1:2026-09-14").spend.toString(), "30");
  assert.equal(h.state.metrics.get("10:2026-09-14").spend, "10");
  assert.equal(h.state.campaigns.get("meta-111").historySyncedThrough.toISOString().slice(0, 10), "2026-09-13");
  assert.equal(h.calls().filter(e => e.kind === "GET.insights").length, 1);
});

test("INACTIVE spend persist failure rolls back rows/checkpoint without retry", async () => {
  const h = harness({ failWrite: "db.spend.upsert", wls: [wl({ spendHistorySyncedThrough: day("2026-09-13") })] });
  const summary = await h.run();
  assert.equal(summary.wlFailed, 1);
  assert.equal(h.state.spends.get("1:2026-09-14").spend.toString(), "10");
  assert.equal(h.state.wls[0].spendHistorySyncedThrough.toISOString().slice(0, 10), "2026-09-13");
  assert.equal(h.events.filter(e => e.kind === "db.spend.upsert").length, 1);
  assert.equal(h.calls().filter(e => e.kind === "GET.insights").length, 0);
});

test("INACTIVE retains known campaigns omitted from discovery and excludes today's new campaign", async () => {
  const h = harness();
  h.payloads["111"].campaigns = [apiCampaign({ id: "today-only", start_time: "2026-09-15T01:00:00Z" })];
  h.payloads["111"].insights.push(insight({ campaign_id: "today-only", date_start: "2026-09-15" }));
  await h.run();
  assert.equal(h.state.metrics.get("10:2026-09-14").spend, "30.00");
  assert.equal(h.state.metrics.size, 1);
  assert.equal(h.state.campaigns.get("today-only").historySyncedThrough, null);
  assert.equal(h.events.filter(e => e.kind === "db.campaigns.read").length, 1);
  assert.equal(h.calls().filter(e => e.kind === "GET.insights").length, 1);
});

test("UNAVAILABLE access errors 10/100/200 preserve baseline and never reconcile", async () => {
  for (const code of [10, 100, 200]) {
    const payloads = { "111": { statusError: code } };
    const before = harness({ baseline: true, payloads }), after = harness({ payloads });
    assert.deepEqual(await after.run(), await before.run());
    assert.deepEqual(after.events, before.events);
    assert.equal(after.state.wls[0].status, "UNAVAILABLE");
    assert.equal(after.calls().length, 1);
    assert.equal(after.events.filter(row => row.kind === "db.campaigns.read").length, 0);
  }
});

test("reactivation takes normal ACTIVE path and updates the same campaign/date row", async () => {
  const h = harness();
  await h.run();
  h.payloads["111"].status = 1;
  const offset = h.events.length;
  const summary = await h.run();
  assert.equal(h.state.wls[0].status, "ACTIVE");
  assert.equal(summary.wlSucceeded, 1);
  assert.equal(h.state.metrics.size, 1);
  const calls = h.events.slice(offset).filter(row => row.kind.startsWith("GET."));
  assert.deepEqual(calls.map(row => row.kind), ["GET.status", "GET.campaigns", "GET.adSets", "GET.spend", "GET.insights"]);
  assert.deepEqual(calls.at(-1).args.range, { since: "2026-09-14", until: "2026-09-15" });
});

test("INACTIVE success keeps pacing before the next WL instead of skipping the delay", async () => {
  const h = harness({ wls: [wl(), wl({ id: 2, accountId: "222" })], payloads: {
    "111": { status: 2, campaigns: [apiCampaign()], adSets: [], spend: [], insights: [] },
    "222": { status: 1, campaigns: [], adSets: [], spend: [], insights: [] },
  } });
  const summary = await h.run();
  assert.equal(summary.wlSkipped, 1);
  assert.equal(summary.wlSucceeded, 1);
  const wait = h.events.findIndex(e => e.kind === "WAIT");
  const second = h.events.findIndex(e => e.kind === "GET.status" && e.args.accountId === "222");
  assert(wait > 0 && wait < second);
});
