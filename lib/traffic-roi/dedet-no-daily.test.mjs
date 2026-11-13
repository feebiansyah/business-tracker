import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { loadTs, root } from "../filter/sync-baseline.test.mjs";
const require = createRequire(import.meta.url), ts = require("typescript"), React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
const baseline = "afca3c2cc005167de8886f038414ab4558f5bc65";
const source = name => readFileSync(path.join(root, name), "utf8").replaceAll("\r", "");
const original = name => execFileSync("git", ["show", `${baseline}:${name}`], { cwd: root, encoding: "utf8" }).replaceAll("\r", "");
const daily = /syncClickaduDailyAction|syncAdsterraDailyAction|getClickaduDailyHistoryAction|getAdsterraDailyHistoryAction/;

test("Dedetstudio has no UI/action entry point for Traffic daily sync or history", () => {
  const files = dir => readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(`${dir}/${item.name}`) : /\.tsx?$/.test(item.name) ? [`${dir}/${item.name}`] : []);
  for (const file of [...files("app"), ...files("components")]) {
    assert.doesNotMatch(source(file), daily, file);
    assert.doesNotMatch(source(file), /Sync Clickadu|Sync Adsterra|Histori Harian Clickadu|Histori Harian Adsterra|ClickaduCampaignHistoryModal|AdsterraCampaignHistoryModal/, file);
  }
  assert.equal(existsSync(path.join(root, "components/clickadu-roi/campaign-history-modal.tsx")), false);
  assert.equal(existsSync(path.join(root, "components/adsterra-roi/campaign-history-modal.tsx")), false);
});

test("all non-daily Traffic server functions and protected modules remain byte-identical", () => {
  for (const provider of ["clickadu", "adsterra"]) {
    const file = `app/shopee/[id]/${provider}-roi/actions.ts`;
    const functions = text => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true).statements.filter(ts.isFunctionDeclaration);
    const current = new Map(functions(source(file)).map(node => [node.name.text, node.getText()]));
    for (const node of functions(original(file))) {
      if (daily.test(node.name.text)) { assert.equal(current.has(node.name.text), false);continue; }
      assert.equal(current.get(node.name.text), node.getText(), node.name.text);
    }
  }
  for (const file of ["lib/traffic-balances/service.ts", "lib/traffic-balances/providers.ts", "components/traffic-balances/traffic-balances.tsx", "lib/dashboard/queries.ts", "lib/filter/meta-sync-batch.ts", "lib/shopee-import/persistence.ts", "prisma/schema.prisma", "lib/adsterra-roi/campaign-display.ts", "lib/traffic-roi/campaign-display.ts"]) assert.equal(source(file), original(file), file);
  assert.equal(execFileSync("git", ["diff", "--name-only", baseline, "--", "lib/adsterra-operations", "lib/adsterra-roi", "lib/clickadu-roi", "lib/adsterra-history", "lib/clickadu-history", "lib/shopee-import", "lib/shopee-click-import", "lib/traffic-balances", "lib/filter", "lib/meta", "lib/auth", "prisma", ".github", "scripts", ":(exclude)lib/clickadu-roi/workflow-contract.test.mjs", ":(exclude)lib/clickadu-history/ui-contract.test.mjs", ":(exclude)lib/adsterra-history/ui-contract.test.mjs"], { cwd: root, encoding: "utf8" }), "");
  const file = "components/adsterra-roi/campaign-report-list.tsx";
  function handler(text, name) {
    const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);let found;
    function visit(node) { if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name?.getText() === name) found = node.getText();ts.forEachChild(node, visit); } visit(tree);return found;
  }
  for (const name of ["refreshStatuses", "toggleCampaign", "confirmToggle", "toggleAutoSchedule"]) { assert(handler(original(file), name), name);assert.equal(handler(source(file), name), handler(original(file), name), name); }
});

test("old Traffic overview URLs render only Meta with no Traffic query, while balances and Replace history remain", async () => {
  const button = loadTs("components/ui/button.tsx"), router = { useRouter: () => ({ refresh() {}, push() {} }) };
  const sync = loadTs("components/dashboard/shopee-overview-sync.tsx", { "next/navigation": router, "@/components/ui/button": button, "@/app/shopee/[id]/filter/actions": { syncFilterAction: () => assert.fail("no live sync") } });
  const link = { default: ({ children, ...props }) => React.createElement("a", props, children) };
  const size = loadTs("components/dashboard/dashboard-page-size-select.tsx", { "next/navigation": router });
  const performanceCard = loadTs("components/dashboard/shopee-performance-card.tsx", { "next/link": link, "./dashboard-page-size-select": size });
  const balanceView = loadTs("components/traffic-balances/balance-view.tsx", { "@/components/ui/button": button });
  const balances = loadTs("components/traffic-balances/traffic-balances.tsx", { "./balance-view": balanceView, "@/app/traffic-balances/actions": { getTrafficBalancesAction: () => assert.fail("no provider read") } });
  const account = { id: 7, name: "Shopee mock", status: "ACTIVE", lastMetaSyncAt: new Date("2026-11-05T05:00:00Z"), metaAccounts: [{ id: 11, name: "WL Satu", accountId: "11", status: "ACTIVE", businessManager: null, _count: { campaigns: 1 } }], commissionImports: [], clickImports: [], clickaduCampaignConfigs: [{ label: "Clickadu contoh", campaignId: "4017006", lastBlacklistReplacedAt: null }], adsterraCampaignConfigs: [{ label: null, campaignId: "1437356", lastBlacklistReplacedAt: null }] };
  let accountReads = 0, noteReads = 0, metaReads = 0;
  const state = { from: "2026-11-01", to: "2026-11-06", accounts: { 7: { sort: "date", dir: "desc", page: 1, pageSize: 25 } } };
  const dashboard = { state, accounts: [{ id: 7, name: account.name, wlCount: 1, state: state.accounts[7], summary: { budget: 100, costWithFee: 105, commission: 200, profit: 95, profitPercent: 90 }, days: [], pagination: { page: 1, pageSize: 25, total: 0, pageCount: 1 } }] };
  const { default: Page } = loadTs("app/shopee/[id]/page.tsx", {
    "next/link": link, "next/navigation": { notFound: () => assert.fail("missing account") }, "@/components/ui/button": button,
    "@/components/shopee/status-badge": loadTs("components/shopee/status-badge.tsx"), "@/components/dashboard/shopee-overview-sync": sync,
    "@/components/dashboard/shopee-performance-card": performanceCard, "@/components/traffic-balances/traffic-balances": balances,
    "@/components/shopee/account-management": { ShopeeAccountManagement: () => React.createElement("div", null, "Edit/Hapus akun existing") },
    "@/lib/prisma": { prisma: { shopeeAccount: { findUnique: async args => { accountReads++;assert.equal(args.where.id, 7);assert.deepEqual(args.include.clickaduCampaignConfigs.select, { label: true, campaignId: true, lastBlacklistReplacedAt: true });assert.deepEqual(args.include.adsterraCampaignConfigs.select, args.include.clickaduCampaignConfigs.select);return account; } }, $queryRaw: async () => { noteReads++;return [{ count: 2n }]; } } },
    "@/lib/dashboard/queries": { getShopeeDashboardData: async (id, raw) => { assert.equal(id, 7);assert.equal(raw.from, state.from);metaReads++;return dashboard; } },
    "@/lib/dashboard/clickadu-overview": { getShopeeClickaduOverview: () => assert.fail("Traffic query") }, "@/lib/dashboard/adsterra-overview": { getShopeeAdsterraOverview: () => assert.fail("Traffic query") },
    "@/lib/meta/config": { getMetaConfig: () => ({}) }, "@/lib/filter/meta-sync-state": { getMetaSyncProgress: async () => null },
  });
  for (const overviewTab of ["meta", "clickadu", "adsterra"]) {
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ id: "7" }), searchParams: Promise.resolve({ overviewTab, from: state.from, to: state.to }) }));
    assert.match(html, /Sync Meta/);assert.match(html, /Saldo Traffic/);assert.match(html, /Riwayat Replace Blacklist/);assert.match(html, /Clickadu contoh/);assert.match(html, /1437356/);assert.match(html, /Catatan: 2 belum selesai/);
    assert.match(html, /name="from"[^>]*value="2026-11-01"/);assert.match(html, /name="to"[^>]*value="2026-11-06"/);
    assert.doesNotMatch(html, /Sync Clickadu|Sync Adsterra|Cakupan Sync|role="tab"|adsterraSort|clickaduSort/);
  }
  assert.equal(accountReads, 3);assert.equal(noteReads, 3);assert.equal(metaReads, 3);
});

test("Overview loads Meta and Replace history only, not Traffic daily coverage/overview", () => {
  const text = source("app/shopee/[id]/page.tsx");
  assert.doesNotMatch(text, /getShopeeClickaduOverview|getShopeeAdsterraOverview|ShopeeClickaduOverview|ShopeeAdsterraOverview|historySyncedThrough|Cakupan Sync/);
  assert.match(text, /ShopeePerformanceCard/);assert.match(text, /getShopeeDashboardData/);
  assert.match(text, /TrafficBalances/);assert.match(text, /lastBlacklistReplacedAt/);assert.match(text, /Riwayat Replace Blacklist/);
  assert.doesNotMatch(source("lib/dashboard/operational-query.ts"), /historySyncedThrough/);
  assert.doesNotMatch(source("app/page.tsx"), /campaign ter-cover D-1/);
});

test("campaign tables retain Budget/CPM and operations but names cannot open history", () => {
  const button = loadTs("components/ui/button.tsx");
  const metadata = { dailyBudgetUsd: 50, countryCpm: [{ country: "ID", amount: 0.5 }] };
  const row = { id: 1, campaignId: "1437356", label: "Campaign contoh", sourceTag: "TAG", autoScheduleEnabled: false };
  const common = { "@/components/ui/button": button };
  const click = loadTs("components/clickadu-roi/campaign-report-list.tsx", { ...common, "@/app/shopee/[id]/clickadu-roi/actions": {}, "./list-method-context": { useClickaduListMethod: () => ({ reads: { 1: { actual: { method: "BLACKLIST" }, display: metadata } }, plans: {}, busy: false }) } }).ClickaduCampaignReportList;
  const ad = loadTs("components/adsterra-roi/campaign-report-list.tsx", { ...common, "@/app/shopee/[id]/adsterra-roi/actions": {}, "./campaign-placement-lists": { useAdsterraPlacementLists: () => ({ lists: [], busy: false }) }, "./operation-context": { useAdsterraOperation: () => ({ revision: 0, readRevision: () => 0 }) }, "./campaign-method-controls": { CampaignMethodControls: () => React.createElement("span", null, "Metode existing") }, "./operation-dialog": { OperationNotice: () => null } }).AdsterraCampaignReportList;
  for (const Component of [click, ad]) {
    const html = renderToStaticMarkup(React.createElement(Component, { shopeeAccountId: 7, campaigns: [row], connected: true, campaignDisplay: { 1: metadata } }));
    assert.match(html, /Budget Harian/);assert.match(html, /CPM Negara/);assert.match(html, /\$50\.00/);assert.match(html, /ID \$0\.50/);
    assert.match(html, /Metode/);assert.doesNotMatch(html, /Sync Clickadu|Sync Adsterra|laporan harian|<button[^>]*>Campaign contoh/);
    assert.match(html, /overflow-x-auto/);
    if (Component === ad) { for (const text of ["Status", "Auto", "Aksi", "Refresh Status"]) assert.match(html, new RegExp(text)); }
  }
});

test("Adsterra status read still renders ACTIVE, Auto and OFF without starting any mutation", async () => {
  const hooks = [];let cursor = 0, reads = 0;
  const hook = create => { const i = cursor++;if (!(i in hooks)) hooks[i] = create();return [hooks[i], i]; };
  const fakeReact = { ...React,
    useState: value => { const [state, i] = hook(() => typeof value === "function" ? value() : value);return [state, next => { hooks[i] = typeof next === "function" ? next(hooks[i]) : next; }]; },
    useRef: value => hook(() => ({ current: value }))[0], useCallback: fn => fn,
    useEffect: fn => { hook(() => { fn();return true; }); },
  };
  const operation = { revision: 0, readRevision: () => 0, busy: false, changing: false };
  const { AdsterraCampaignReportList } = loadTs("components/adsterra-roi/campaign-report-list.tsx", {
    react: fakeReact, "@/components/ui/button": loadTs("components/ui/button.tsx"),
    "@/app/shopee/[id]/adsterra-roi/actions": { getAdsterraCampaignStatusesAction: async id => { assert.equal(id, 7);reads++;return { success: true, statuses: [{ configId: 1, autoScheduleEnabled: true, campaignStatus: { campaignId: 1437356, activeCode: 1, status: "ACTIVE" }, error: null }] }; }, setAdsterraCampaignActiveAction: () => assert.fail("no status write"), setAdsterraAutoScheduleEnabledAction: () => assert.fail("no Auto write") },
    "./campaign-placement-lists": { useAdsterraPlacementLists: () => ({ lists: [], busy: false }) }, "./operation-context": { useAdsterraOperation: () => operation }, "./campaign-method-controls": { CampaignMethodControls: () => React.createElement("span", null, "Metode existing") }, "./operation-dialog": { OperationNotice: () => null },
  });
  const render = () => { cursor = 0;return AdsterraCampaignReportList({ shopeeAccountId: 7, connected: true, campaigns: [{ id: 1, campaignId: "1437356", label: "Campaign contoh", sourceTag: "TAG", autoScheduleEnabled: false }], campaignDisplay: { 1: { dailyBudgetUsd: 50, countryCpm: [{ country: "ID", amount: 0.5 }] } } }); };
  render();await new Promise(resolve => setImmediate(resolve));
  const html = renderToStaticMarkup(render());
  assert.equal(reads, 1);assert.match(html, />Active</);assert.match(html, /type="checkbox"[^>]*checked=""/);assert.match(html, />OFF</);assert.match(html, /Refresh Status/);assert.match(html, /ID \$0\.50/);assert.doesNotMatch(html, /Sync Adsterra/);
});
