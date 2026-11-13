import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { loadTs } from "../filter/sync-baseline.test.mjs";
const require = createRequire(import.meta.url);

const display = () => loadTs("lib/traffic-roi/campaign-display.ts");
const campaign = { id: 1437356, pricing_type: "CPM", daily_budget_limit: 50, pricing_settings: [{ price: 0.24, country_code: "ID" }] };

test("Clickadu real response fields and rateModel gate display only", () => {
  const api = display();
  for (const rateModel of ["CPM", "cpm", "SCPM", "SmartCPM"]) {
    const parsed = api.parseClickaduCampaignDisplay({ dailyAmount: 50, rateModel, rates: [{ amount: 0.22, countries: ["id"] }] });
    assert.equal(api.displayBudgetUsd(parsed), "$50.00");
    assert.equal(api.displayCountryCpm(parsed), "ID $0.22");
  }
  for (const rateModel of ["CPC", "CPA", "SCPA", "SCPC", "unknown", null, undefined]) {
    const parsed = api.parseClickaduCampaignDisplay({ dailyAmount: 50, rateModel, rates: [{ amount: 0.22, countries: ["id"] }] });
    assert.equal(api.displayBudgetUsd(parsed), "$50.00");
    assert.equal(api.displayCountryCpm(parsed), "—");
  }
});

test("country/countries arrays, multi-country, missing and malformed fields never become zero", () => {
  const api = display();
  const parsed = api.parseClickaduCampaignDisplay({ dailyAmount: 12, rateModel: "CPM", rates: [{ amount: 0.5, countries: ["id", "my"] }, { amount: 1.2, country: ["us"] }] });
  assert.equal(api.displayCountryCpm(parsed), "ID $0.50 · MY $0.50 · US $1.20");
  for (const body of [null, {}, { dailyAmount: null }, { dailyAmount: "" }, { dailyAmount: "50" }, { dailyAmount: -1 }, { dailyAmount: Infinity }]) assert.equal(api.displayBudgetUsd(api.parseClickaduCampaignDisplay(body)), "—");
  for (const rates of [undefined, null, [], [{ amount: "0.5", countries: ["id"] }], [{ amount: 0.5, countries: [null] }], [{ amount: -1, countries: ["id"] }], [{ amount: 1, countries: ["id"] }, { amount: 2, countries: ["id"] }]]) assert.equal(api.displayCountryCpm(api.parseClickaduCampaignDisplay({ rateModel: "CPM", rates })), "—");
  assert.equal(api.displayBudgetUsd(api.parseClickaduCampaignDisplay({ dailyAmount: 0 })), "$0.00");
});

test("Adsterra bulk response parses base country prices, not placement Custom Bid", () => {
  const api = display(), rows = api.parseAdsterraCampaignDisplays({ items: [campaign], itemCount: 1 });
  assert.equal(api.displayBudgetUsd(rows["1437356"]), "$50.00");
  assert.equal(api.displayCountryCpm(rows["1437356"]), "ID $0.24");
  assert.equal(api.displayCountryCpm(api.parseAdsterraCampaignDisplays({ items: [{ ...campaign, pricing_type: "CPC" }], itemCount: 1 })["1437356"]), "—");
  for (const body of [null, {}, { items: [campaign], itemCount: 2 }, { items: [campaign, campaign], itemCount: 2 }, { items: [{ ...campaign, id: null }], itemCount: 1 }]) assert.throws(() => api.parseAdsterraCampaignDisplays(body));
  const missing = api.parseAdsterraCampaignDisplays({ items: [{ id: 1 }], itemCount: 1 });
  assert.equal(api.displayBudgetUsd(missing["1"]), "—");assert.equal(api.displayCountryCpm(missing["1"]), "—");
});

test("Adsterra aliases and many configs use one bounded GET and expose only scoped display data", async () => {
  const { loadAdsterraCampaignDisplays } = loadTs("lib/adsterra-roi/campaign-display.ts");
  let requests = 0, credentialReads = 0;
  const configs = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, shopeeAccountId: 7, campaignId: i % 2 ? "001437356" : "1437356" }));
  const result = await loadAdsterraCampaignDisplays(7, configs, {
    loadCredential: async id => { assert.equal(id, 7);credentialReads++;return { shopeeAccountId: 7, provider: "ADSTERRA", encryptedSecret: "encrypted" }; },
    decrypt: () => "mock-key",
    fetchImpl: async (url, init) => { requests++;assert.equal(url, "https://api3.adsterratools.com/advertiser/campaigns.json");assert.equal(init.method, "GET");assert.equal(init.body, undefined);assert(init.signal);return new Response(JSON.stringify({ items: [campaign, { ...campaign, id: 999 }], itemCount: 2 })); },
  });
  assert.equal(requests, 1);assert.equal(credentialReads, 1);assert.equal(Object.keys(result).length, 25);
  assert.deepEqual(result[1], result[2]);assert.doesNotMatch(JSON.stringify(result), /mock-key|encrypted|999|placement/i);
});

test("Adsterra failures, incomplete response and wrong credential scope never trigger fallback GETs", async () => {
  const { loadAdsterraCampaignDisplays } = loadTs("lib/adsterra-roi/campaign-display.ts");
  const configs = [{ id: 1, shopeeAccountId: 7, campaignId: "1437356" }];
  for (const response of [new Response("{}", { status: 422 }), new Response("invalid"), new Response(JSON.stringify({ items: [campaign], itemCount: 2 })), new Error("timeout")]) {
    let requests = 0;
    const result = await loadAdsterraCampaignDisplays(7, configs, { loadCredential: async () => ({ shopeeAccountId: 7, provider: "ADSTERRA", encryptedSecret: "x" }), decrypt: () => "mock", fetchImpl: async () => { requests++;if (response instanceof Error) throw response;return response; } });
    assert.deepEqual(result, {});assert.equal(requests, 1);
  }
  let requests = 0;
  assert.deepEqual(await loadAdsterraCampaignDisplays(7, configs, { loadCredential: async () => ({ shopeeAccountId: 8, provider: "ADSTERRA", encryptedSecret: "x" }), decrypt: () => "mock", fetchImpl: async () => { requests++; } }), {});
  assert.equal(requests, 0);
});

test("existing Clickadu list action still uses exactly one campaign GET, including malformed display fields", async () => {
  let requests = 0;
  const body = { id: 4171393, targeting: { zone: { isExcluded: true, list: ["123"] } }, dailyAmount: 50, rateModel: "CPM", rates: [{ amount: 0.22, countries: ["id"] }] };
  const { getClickaduListAction } = loadTs("app/shopee/[id]/clickadu-roi/list-actions.ts", {
    "next/cache": { revalidatePath: () => assert.fail("no cache write") },
    "@/lib/auth/session": { requireUser: async () => ({ id: 1 }) }, "@/lib/prisma": { prisma: {} },
    "@/lib/clickadu-roi/config-repository": { getClickaduConfigById: async (_db, accountId, configId) => { assert.equal(accountId, 7);assert.equal(configId, 1);return { id: 1, shopeeAccountId: 7, campaignId: "4171393" }; } },
    "@/lib/clickadu-roi/config": { getClickaduClient: () => ({ getCampaign: async id => { assert.equal(id, "4171393");requests++;return body; } }) },
    "@/lib/traffic-credentials/repository": { getEncryptedTrafficCredential: async () => ({ id: 1, encryptedSecret: "mock" }) },
    "@/lib/traffic-credentials/crypto": { decryptTrafficSecret: () => "mock" },
    "@/lib/clickadu-roi/analyze": {}, "@/lib/shopee-import/upload": {},
  });
  const a = await getClickaduListAction(7, 1);assert.equal(a.success, true);assert.equal(requests, 1);
  assert.deepEqual(a.actual, { method: "BLACKLIST", zoneIds: ["123"] });assert.equal(display().displayCountryCpm(a.display), "ID $0.22");
  body.dailyAmount = null;body.rates = null;
  const b = await getClickaduListAction(7, 1);assert.equal(b.success, true);assert.equal(requests, 2);assert.deepEqual(b.actual, a.actual);
  assert.equal(display().displayBudgetUsd(b.display), "—");assert.equal(display().displayCountryCpm(b.display), "—");
});

test("real campaign tables add exactly two display columns, safe dashes and existing scroll panels", () => {
  const React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
  const button = loadTs("components/ui/button.tsx");
  const row = { id: 1, campaignId: "1437356", label: "Campaign panjang", sourceTag: "TAG", autoScheduleEnabled: false };
  const metadata = display().parseClickaduCampaignDisplay({ dailyAmount: 50, rateModel: "CPM", rates: [{ amount: 0.5, countries: ["id"] }, { amount: 1.2, countries: ["us"] }] });
  const clickStubs = { "@/app/shopee/[id]/clickadu-roi/actions": {}, "./campaign-history-modal": { ClickaduCampaignHistoryModal: () => null }, "./list-method-context": { useClickaduListMethod: () => ({ reads: { 1: { loading: true, actual: { method: "BLACKLIST", zoneIds: [] }, display: metadata } }, plans: {}, busy: false }) } };
  const adStubs = { "@/app/shopee/[id]/adsterra-roi/actions": {}, "./campaign-history-modal": { AdsterraCampaignHistoryModal: () => null }, "./campaign-placement-lists": { useAdsterraPlacementLists: () => ({ lists: [], busy: false }) }, "./operation-context": { useAdsterraOperation: () => ({ revision: 0, readRevision: () => 0 }) }, "./campaign-method-controls": { CampaignMethodControls: () => React.createElement("span", null, "Metode existing") }, "./operation-dialog": { OperationNotice: () => null } };
  const { ClickaduCampaignReportList } = loadTs("components/clickadu-roi/campaign-report-list.tsx", { ...clickStubs, "@/components/ui/button": button });
  const { AdsterraCampaignReportList } = loadTs("components/adsterra-roi/campaign-report-list.tsx", { ...adStubs, "@/components/ui/button": button });
  for (const [Component, extra, count] of [[ClickaduCampaignReportList, {}, 6], [AdsterraCampaignReportList, { campaignDisplay: { 1: metadata } }, 7]]) {
    const html = renderToStaticMarkup(React.createElement(Component, { shopeeAccountId: 7, campaigns: [row], connected: true, ...extra }));
    assert.equal((html.match(/<th /g) ?? []).length, count);assert.equal((html.match(/Budget Harian/g) ?? []).length, 1);assert.equal((html.match(/CPM Negara/g) ?? []).length, 1);
    assert.match(html, /\$50\.00/);assert.match(html, /ID \$0\.50 · US \$1\.20/);assert.match(html, /overflow-x-auto/);
  }
  const missing = renderToStaticMarkup(React.createElement(AdsterraCampaignReportList, { shopeeAccountId: 7, campaigns: [row], connected: true }));
  assert.doesNotMatch(missing, /\$0\.00/);assert.match(missing, /—/);
});

test("Adsterra response size bound and no-config scope do not issue additional requests", async () => {
  const { loadAdsterraCampaignDisplays } = loadTs("lib/adsterra-roi/campaign-display.ts");
  let requests = 0, credentials = 0;
  const deps = { loadCredential: async () => { credentials++;return { shopeeAccountId: 7, provider: "ADSTERRA", encryptedSecret: "x" }; }, decrypt: () => "mock", fetchImpl: async () => { requests++;return new Response("x".repeat(2_000_001)); } };
  assert.deepEqual(await loadAdsterraCampaignDisplays(7, [], deps), {});assert.equal(credentials, 0);assert.equal(requests, 0);
  assert.deepEqual(await loadAdsterraCampaignDisplays(7, [{ id: 1, shopeeAccountId: 8, campaignId: "1" }], deps), {});assert.equal(credentials, 0);assert.equal(requests, 0);
  assert.deepEqual(await loadAdsterraCampaignDisplays(7, [{ id: 1, shopeeAccountId: 7, campaignId: "1" }], deps), {});assert.equal(requests, 1);
});

test("Adsterra page authenticates read-only before the single scoped display load", async () => {
  const events = [];
  const configs = [{ id: 1, shopeeAccountId: 7, campaignId: "1437356" }];
  const stubs = {
    "next/link": {}, "next/navigation": { notFound: () => assert.fail("unexpected missing account") }, "@/lib/prisma": { prisma: {} },
    "@/lib/auth/session": { requireUser: async options => { assert.deepEqual(options, { readOnly: true });events.push("auth"); } },
    "@/lib/adsterra-roi/config-repository": { getAdsterraConfigPageData: async (_db, id) => { assert.equal(id, 7);events.push("config");return { account: { id: 7, name: "Shop" }, configs, connected: true }; } },
    "@/lib/traffic-credentials/repository": { getEncryptedTrafficCredential: async (_db, id, provider) => { assert.equal(id, 7);assert.equal(provider, "ADSTERRA");events.push("credential");return { shopeeAccountId: 7, provider: "ADSTERRA", encryptedSecret: "secret" }; } },
    "@/lib/traffic-credentials/crypto": { decryptTrafficSecret: () => "not-sent-to-ui" },
    "@/lib/adsterra-roi/campaign-display": { loadAdsterraCampaignDisplays: async (id, rows, deps) => { assert.equal(id, 7);assert.equal(rows, configs);await deps.loadCredential(id);events.push("display");return { 1: { dailyBudgetUsd: 50, countryCpm: [{ country: "ID", amount: 0.24 }] } }; } },
  };
  for (const name of ["credential-form", "config-form", "analysis-workflow", "campaign-report-list", "adsterra-workspace-tabs", "protective-controls"]) stubs[`@/components/adsterra-roi/${name}`] = {};
  const { default: Page } = loadTs("app/shopee/[id]/adsterra-roi/page.tsx", stubs);
  const tree = await Page({ params: Promise.resolve({ id: "7" }) });
  assert.deepEqual(events, ["auth", "config", "credential", "display"]);
  const props = tree.props.children[1].props.campaign.props;
  assert.deepEqual(props.campaignDisplay, { 1: { dailyBudgetUsd: 50, countryCpm: [{ country: "ID", amount: 0.24 }] } });
  assert.doesNotMatch(JSON.stringify(props), /secret|not-sent-to-ui/);
});
