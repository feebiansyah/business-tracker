import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "../filter/sync-baseline.test.mjs";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { getWlCampaignReminders } = loadTs("lib/shopee/wl-campaign-reminders.ts");

test("Overview distinguishes a new WL, stored PAUSED campaigns, and successfully processed empty WL", async () => {
  let reads = 0;
  const db = { $queryRaw: async (strings, ...values) => {
    reads++;
    assert.deepEqual(values, [5]);
    const sql = strings.join("?");
    assert.match(sql, /w\.shopeeAccountId = \?/);
    assert.match(sql, /p\.metaAccountId = w\.id/);
    assert.match(sql, /p\.accountId = w\.accountId/);
    assert.match(sql, /r\.shopeeAccountId = w\.shopeeAccountId/);
    assert.match(sql, /p\.status = 'SUCCEEDED'/);
    assert.match(sql, /p\.phase = 'DONE'/);
    assert.match(sql, /p\.error IS NULL/);
    assert.match(sql, /HAVING SUM\(CASE WHEN c\.metaStatus = 'ACTIVE'/);
    return [
      { id: 190, campaignCount: 0n, syncSucceeded: 0n },
      { id: 191, campaignCount: 2n, syncSucceeded: 1n },
      { id: 192, campaignCount: 0n, syncSucceeded: 1n },
      { id: 193, campaignCount: 0n, syncSucceeded: 0n },
      { id: 194, campaignCount: 0n, syncSucceeded: 0n },
    ];
  } };
  const reminders = await getWlCampaignReminders(db, 5);
  assert.equal(reads, 1, "one bulk read, independent of WL count");
  assert.equal(reminders.get(190).message, "Belum terverifikasi melalui Sync Meta");
  assert.equal(reminders.get(190).hint, "Jalankan Sync Meta untuk memuat campaign WL baru.");
  assert.equal(reminders.get(191).message, "Tidak ada campaign aktif pada data tersimpan.");
  assert.equal(reminders.get(192).message, "Sync selesai, tidak ada campaign tersimpan.");
  for (const id of [193, 194]) {
    assert.equal(reminders.get(id).message, "Belum terverifikasi melalui Sync Meta", "FAILED/UNAVAILABLE are not successful read evidence");
  }
});

test("all-active or no-WL scope returns no reminder rows", async () => {
  const reminders = await getWlCampaignReminders({ $queryRaw: async () => [] }, 7);
  assert.equal(reminders.size, 0);
});

test("bulk SQL excludes other Shopee/WL identities and never accepts skipped, failed or unfinished progress as proof", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const memory = new DatabaseSync(":memory:");
  try {
    memory.exec(`
      CREATE TABLE MetaAccount (id INTEGER, accountId TEXT, shopeeAccountId INTEGER);
      CREATE TABLE Campaign (id INTEGER, metaAccountId INTEGER, metaStatus TEXT);
      CREATE TABLE MetaSyncRun (id TEXT, shopeeAccountId INTEGER, status TEXT);
      CREATE TABLE MetaSyncWlProgress (runId TEXT, metaAccountId INTEGER, accountId TEXT, status TEXT, phase TEXT, error TEXT);
      INSERT INTO MetaSyncRun VALUES ('morning',5,'COMPLETE'),('partial',5,'PARTIAL'),('other',6,'COMPLETE');
      INSERT INTO MetaAccount VALUES (190,'190',5),(191,'191',5),(192,'192',5),(193,'193',5),(194,'194',5),(195,'195',5),(196,'196',5),(197,'197',5),(198,'198',5),(199,'199',5),(200,'200',6);
      INSERT INTO Campaign VALUES (1,191,'PAUSED'),(2,191,'PAUSED'),(3,199,'ACTIVE');
      INSERT INTO MetaSyncWlProgress VALUES
        ('partial',192,'192','SUCCEEDED','DONE',NULL),
        ('morning',193,'193','FAILED','DONE','failed'),
        ('morning',194,'194','SKIPPED','DONE',NULL),
        ('morning',195,'different-account','SUCCEEDED','DONE',NULL),
        ('other',196,'196','SUCCEEDED','DONE',NULL),
        ('morning',197,'197','SUCCEEDED','METADATA',NULL),
        ('morning',198,'198','SUCCEEDED','DONE','error');
    `);
    let reads = 0;
    const reminders = await getWlCampaignReminders({ $queryRaw: async (strings, ...values) => {
      reads++;
      return memory.prepare(strings.join("?")).all(...values);
    } }, 5);
    assert.equal(reads, 1);
    assert.equal(reminders.size, 9);
    assert.equal(reminders.has(199), false, "ACTIVE campaign is not a reminder");
    assert.equal(reminders.has(200), false, "other Shopee is excluded");
    assert.equal(reminders.get(191).message, "Tidak ada campaign aktif pada data tersimpan.");
    assert.equal(reminders.get(192).message, "Sync selesai, tidak ada campaign tersimpan.", "per-WL success does not depend on parent COMPLETE");
    for (const id of [190, 193, 194, 195, 196, 197, 198]) {
      assert.equal(reminders.get(id).message, "Belum terverifikasi melalui Sync Meta");
    }
  } finally {
    memory.close();
  }
});

test("Overview renders matching counts, separate WL status and neutral evidence labels even if parent run is COMPLETE", async () => {
  const source = readFileSync(new URL("../../app/shopee/[id]/page.tsx", import.meta.url), "utf8");
  const componentStubs = Object.fromEntries([...source.matchAll(/import \{ (\w+) \} from "(@\/components\/[^"\n]+)"/g)]
    .map(([, name, module]) => [module, { [name]: () => null }]));
  componentStubs["@/components/shopee/status-badge"] = loadTs("components/shopee/status-badge.tsx");
  const wls = [190, 191, 192, 193, 194, 195].map((id) => ({ id, name: `WL ${id}`, accountId: String(id), status: id === 194 ? "UNAVAILABLE" : "ACTIVE", businessManager: null }));
  const rows = [
    { id: 190, campaignCount: 0, syncSucceeded: 0 },
    { id: 191, campaignCount: 2, syncSucceeded: 0 },
    { id: 192, campaignCount: 0, syncSucceeded: 1 },
    { id: 193, campaignCount: 0, syncSucceeded: 0 },
    { id: 194, campaignCount: 0, syncSucceeded: 0 },
  ];
  const db = {
    shopeeAccount: { findUnique: async ({ where }) => {
      assert.equal(where.id, 5);
      return { id: 5, name: "Abdan", status: "ACTIVE", metaAccounts: wls, commissionImports: [], clickImports: [], trafficCredentials: [], clickaduCampaignConfigs: [], adsterraCampaignConfigs: [], _count: { clickaduCampaignConfigs: 0, adsterraCampaignConfigs: 0 } };
    } },
    $queryRaw: async (strings) => strings.join("").includes("CampaignDailyMetric") ? [{ count: 0 }] : rows,
  };
  const overview = async () => ({ state: { sort: "spend", dir: "desc", pageSize: 20 } });
  const page = loadTs("app/shopee/[id]/page.tsx", {
    ...componentStubs,
    "next/link": { default: ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children) },
    "next/navigation": { notFound: () => { throw new Error("not found"); } },
    "@/lib/prisma": { prisma: db },
    "@/lib/filter/meta-sync-state": { getMetaSyncProgress: async () => ({ runId: "morning", status: "COMPLETE" }) },
    "@/lib/meta/config": { getMetaConfig: () => ({}) },
    "@/lib/dashboard/queries": { getShopeeDashboardData: async () => ({ state: { from: "", to: "", accounts: {} }, accounts: [{ state: {} }] }) },
    "@/lib/dashboard/adsterra-overview": { getShopeeAdsterraOverview: overview },
    "@/lib/dashboard/clickadu-overview": { getShopeeClickaduOverview: overview },
  }).default;
  const html = renderToStaticMarkup(await page({ params: Promise.resolve({ id: "5" }), searchParams: Promise.resolve({}) }));
  assert.match(html, /5 perlu diperiksa pada data tersimpan/);
  assert.doesNotMatch(html, /Semua memiliki campaign aktif/);
  assert.equal((html.match(/Belum terverifikasi melalui Sync Meta/g) ?? []).length, 3);
  assert.match(html, /Tidak ada campaign aktif pada data tersimpan\./);
  assert.match(html, /Sync selesai, tidak ada campaign tersimpan\./);
  assert.match(html, /Tidak tersedia/);
  assert.match(html, /bg-slate-50 text-slate-700/);
});
