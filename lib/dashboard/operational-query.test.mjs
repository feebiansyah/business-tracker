import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { getOperationalDashboard } from "./operational-query.ts";

const record = (id) => ({
  id, name: "Shopee " + id,
  metaAccounts: [{ status: "ACTIVE", spendHistorySyncedThrough: new Date("2026-09-11T00:00:00Z"), _count: { campaigns: 1 } }],
  commissionImports: [{ id: 1 }], clickImports: [{ id: 1 }],
  clickaduCampaignConfigs: [], adsterraCampaignConfigs: [],
});

test("Dashboard starts one account load and one grouped note count in parallel", async () => {
  let accountCalls = 0, noteCalls = 0, query, noteSql, release;
  const ready = new Promise(resolve => { release = resolve; });
  const db = {
    shopeeAccount: { findMany: async args => { accountCalls++; query = args; return ready; } },
    $queryRaw: async strings => { noteCalls++; noteSql = strings.join(""); return []; },
  };
  const pending = getOperationalDashboard(new Date("2026-09-12T05:00:00Z"), db);
  assert.equal(accountCalls, 1);
  assert.equal(noteCalls, 1);
  release([]);
  const result = await pending;
  assert.equal(result.targetDate, "2026-09-11");
  assert.equal(result.summary.totalShopee, 0);
  assert.deepEqual(query.select.metaAccounts.select._count.select.campaigns.where, { metaStatus: "ACTIVE" });
  assert.deepEqual(query.select.clickaduCampaignConfigs.select, { historySyncedThrough: true, lastBlacklistReplacedAt: true });
  assert.deepEqual(query.select.adsterraCampaignConfigs.select, { id: true, campaignId: true, label: true, historySyncedThrough: true, lastBlacklistReplacedAt: true });
  for (const imports of [query.select.commissionImports, query.select.clickImports]) {
    assert.equal(imports.take, 1);
    assert.equal(imports.where.dateFrom.lte.toISOString(), "2026-09-11T00:00:00.000Z");
    assert.equal(imports.where.dateTo.gte.toISOString(), "2026-09-11T00:00:00.000Z");
  }
  assert.match(noteSql, /GROUP BY ma\.shopeeAccountId/);
  assert.match(noteSql, /COUNT\(\*\)/);
  assert.match(noteSql, /dm\.completed = false/);
  assert.match(noteSql, /dm\.note IS NOT NULL AND TRIM\(dm\.note\) <> ''/);
  assert.doesNotMatch(noteSql.split("FROM")[0], /dm\.note/);
});

test("grouped note SQL excludes null/empty/spaces/completed and scopes counts per Shopee", async () => {
  const memory = new DatabaseSync(":memory:");
  try {
    memory.exec("CREATE TABLE MetaAccount(id INTEGER,shopeeAccountId INTEGER); CREATE TABLE Campaign(id INTEGER,metaAccountId INTEGER); CREATE TABLE CampaignDailyMetric(campaignId INTEGER,note TEXT,completed INTEGER); INSERT INTO MetaAccount VALUES(1,1),(2,2),(3,NULL); INSERT INTO Campaign VALUES(1,1),(2,2),(3,3);");
    const insert = memory.prepare("INSERT INTO CampaignDailyMetric VALUES(?,?,?)");
    for (const [campaign, note, completed] of [[1,null,0],[1,"",0],[1,"   ",0],[1,"done",1],[1,"pending 1",0],[1,"pending 2",0],[2,"other Shopee",0],[3,"unlinked",0]]) insert.run(campaign, note, completed);
    let reads = 0;
    const db = {
      shopeeAccount: { findMany: async () => { reads++; return [record(1), record(2), record(4)]; } },
      $queryRaw: async strings => { reads++; return memory.prepare(strings.join("")).all(); },
    };
    const result = await getOperationalDashboard(new Date("2026-09-12T05:00:00Z"), db);
    assert.equal(reads, 2);
    assert.deepEqual(result.accounts.map(a => a.pendingNoteCount), [2,1,0]);
    assert.deepEqual(result.accounts.map(a => a.needsAttention), [true,true,false]);
    assert.equal(result.summary.needsAttention, 2);
  } finally { memory.close(); }
});

test("Adsterra controls retain metadata while coverage uses checkpoints", async () => {
  const db = {
    shopeeAccount: { findMany: async () => [{ ...record(7), adsterraCampaignConfigs: [
      { id: 11, campaignId: "terra-11", label: "Campaign A", historySyncedThrough: null },
      { id: 12, campaignId: "terra-12", label: null, historySyncedThrough: new Date("2026-09-11T00:00:00Z") },
    ] }] },
    $queryRaw: async () => [],
  };
  const result = await getOperationalDashboard(new Date("2026-09-12T05:00:00Z"), db);
  assert.deepEqual(result.accounts[0].adsterraCampaigns, [
    { id: 11, campaignId: "terra-11", label: "Campaign A" },
    { id: 12, campaignId: "terra-12", label: null },
  ]);
  assert.deepEqual(result.accounts[0].adsterra, { totalConfigCount: 2, coveredConfigCount: 1, complete: false });
});

test("Dashboard keeps one work table and full-width balances without daily replacement reminders", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /\["Shopee", "Data D-1", "Pengingat", "Status"\]/);
  assert.match(source, /Status pekerjaan per Shopee/);
  assert.match(source, /Tidak ada pengingat/);
  assert.match(source, /PERLU DICEK/);
  assert.match(source, /colSpan=\{4\}/);
  assert.equal((source.match(/<table /g) ?? []).length, 1);
  assert.doesNotMatch(source, /Status Data|Perlu Perhatian|belum replace|PendingReplacement|grid-cols-\[minmax/);
  assert.ok(source.indexOf("</table>") < source.indexOf("<TrafficBalances"));
  assert.ok(source.indexOf("<TrafficBalances") < source.indexOf("<AdsterraCampaignControls"));
  assert.doesNotMatch(source, /MetaGraphClient|getDashboardData|getCampaignInsights|getAccountDailySpend/);
});

test("Dashboard renders never-replaced reminders in the existing reminder cell", async () => {
  const { createRequire } = await import("node:module");
  const { readFile } = await import("node:fs/promises");
  const { Script } = await import("node:vm");
  const require = createRequire(import.meta.url);
  const ts = require("typescript");
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const config = (lastBlacklistReplacedAt) => ({ historySyncedThrough: new Date("2099-01-01T00:00:00Z"), lastBlacklistReplacedAt });
  const row = (id, clickaduCampaignConfigs = [], adsterraCampaignConfigs = []) => ({
    ...record(id), metaAccounts: [{ status: "ACTIVE", spendHistorySyncedThrough: new Date("2099-01-01T00:00:00Z"), _count: { campaigns: 1 } }],
    clickaduCampaignConfigs, adsterraCampaignConfigs,
  });
  let reads = 0;
  const db = {
    shopeeAccount: { findMany: async () => { reads++; return [row(1), row(2, [config(new Date())], [config(new Date())]), row(3, [config(null), config(new Date()), config(null)]), row(4, [], [config(null)]), row(5, [config(null)], [config(null)])]; } },
    $queryRaw: async () => { reads++; return []; },
  };
  const source = await readFile(new URL("../../app/page.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const loaded = { exports: {} };
  const localRequire = (name) => {
    if (name === "next/link") return { default: ({ href, children }) => React.createElement("a", { href }, children) };
    if (name === "@/lib/prisma") return { prisma: db };
    if (name === "@/lib/dashboard/operational-query") return { getOperationalDashboard };
    if (name.includes("/components/")) return { TrafficBalances: () => null, AdsterraCampaignControls: () => null };
    return require(name);
  };
  new Script("(function(require,module,exports){" + code + "\n})").runInThisContext()(localRequire, loaded, loaded.exports);
  const html = renderToStaticMarkup(await loaded.exports.default());
  const rows = [...html.matchAll(/<tr>(.*?)<\/tr>/g)].map(match => match[1]).slice(1);
  assert.equal(reads, 2);
  assert.equal(rows.length, 5);
  for (const index of [0, 1]) {
    assert.match(rows[index], /Tidak ada pengingat/);
    assert.match(rows[index], /LENGKAP/);
    assert.doesNotMatch(rows[index], /belum Replace/);
  }
  assert.match(rows[2], /Clickadu: 2 campaign belum Replace Zone/);
  assert.match(rows[3], /Adsterra: 1 campaign belum Replace Placement/);
  assert.match(rows[4], /Clickadu: 1 campaign belum Replace Zone/);
  assert.match(rows[4], /Adsterra: 1 campaign belum Replace Placement/);
  for (const index of [2, 3, 4]) assert.match(rows[index], /PERLU DICEK/);
});
