import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("./queries.ts", import.meta.url);

test("history SQL sorts CPC Shopee using commission per Shopee click", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const expression = source.match(/CASE WHEN dm\.commission IS NULL OR dm\.shopeeClicks IS NULL OR dm\.shopeeClicks = 0 THEN NULL ELSE dm\.commission \/ dm\.shopeeClicks END AS cpcShopee/);
  assert.ok(expression, "CPC Shopee SQL must use commission / shopeeClicks with null and zero guards");
  assert.doesNotMatch(source, /ELSE COALESCE\(dm\.spend, 0\) \/ dm\.shopeeClicks END AS cpcShopee/);
  assert.match(source, /cpcShopee: "metric\.cpcShopee"/);
});

test("history returns every day for one scoped campaign, oldest first, without a pagination footer", async () => {
  const { createRequire } = await import("node:module");
  const { loadTs } = await import("./sync-baseline.test.mjs");
  const { parseHistoryParams } = await import("./server-pagination.ts");
  const require = createRequire(import.meta.url), React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
  const runtime = require("@prisma/client/runtime/library");
  const Prisma = { ...runtime, sql: runtime.sqltag };
  const rows = Array.from({ length: 61 }, (_, i) => ({
    id: i + 1, campaignId: 41, date: new Date(Date.UTC(2026, 8, i + 1)), spendValue: 100,
    commission: 200, clickFp: 10, shopeeClicks: 5, cpcFp: 10, note: i === 60 ? "Last note" : "", completed: i === 60,
  }));
  rows.push({ ...rows[0], id: 999, campaignId: 42 });
  let reads = 0;
  const db = {
    campaign: { findFirst: async ({ where }) => where.id === 41 && where.metaAccount.shopeeAccountId === 7 ? {
      id: 41, name: "Campaign", metaStatus: "ACTIVE", startTime: null, firstDeliveryDate: null,
      effectiveDailyBudget: 550000, metaAccount: { name: "WL" },
    } : null },
    campaignDailyMetric: {
      count: async ({ where }) => rows.filter(r => r.campaignId === where.campaignId).length,
      aggregate: async () => ({ _sum: { spend: 6100 } }),
    },
    shopeeCommissionImport: { findMany: async () => [] },
    $queryRaw: async query => {
      reads++;
      assert.match(query.sql, /FROM CampaignDailyMetric dm WHERE dm.campaignId = \?/);
      assert.equal(query.values[0], 41);
      const result = rows.filter(r => r.campaignId === query.values[0]).sort((a, b) => a.date - b.date || a.id - b.id);
      if (/metric.date DESC/.test(query.sql)) result.reverse();
      return /LIMIT/.test(query.sql) ? result.slice(0, 25) : result;
    },
  };
  const api = loadTs("lib/filter/queries.ts", { "@/lib/prisma": { prisma: db }, "@/lib/generated/prisma/client": { Prisma } });
  const params = parseHistoryParams({});
  assert.equal(params.dir, "asc");
  const detail = await api.getCampaignWorkspaceDetail(7, "filter", 41, params);
  assert.equal(detail.dailyMetrics.length, 61);
  assert.equal(detail.dailyMetrics[0].date, "2026-09-01");
  assert.equal(detail.dailyMetrics[60].date, "2026-10-31");
  assert(!detail.dailyMetrics.some(r => r.id === 999));
  assert.equal(reads, 1);
  const desc = await api.getCampaignWorkspaceDetail(7, "filter", 41, { ...params, dir: "desc" });
  assert.equal(desc.dailyMetrics[0].date, "2026-10-31");
  assert.equal(await api.getCampaignWorkspaceDetail(8, "filter", 41, params), null);
  assert.equal(reads, 2);
  const { CampaignDailyTable } = loadTs("components/filter/campaign-daily-table.tsx", {
    "next/navigation": { useRouter: () => ({ push() {}, refresh() {} }) },
    "@/app/shopee/[id]/filter/actions": {},
    "@/components/filter/sortable-header": loadTs("components/filter/sortable-header.tsx"),
    "@/components/filter/table-pagination": loadTs("components/filter/table-pagination.tsx"),
  });
  const html = renderToStaticMarkup(React.createElement(CampaignDailyTable, {
    mode: "filter", shopeeAccountId: 7, campaignId: 41, rows: detail.dailyMetrics,
    pagination: detail.pagination, state: detail.state, compact: true,
  }));
  assert.equal((html.split("<tbody")[1].match(/<tr/g) || []).length, 61);
  assert.equal((html.match(/placeholder="Tambahkan note"/g) || []).length, 61);
  assert.equal((html.match(/type="checkbox"/g) || []).length, 61);
  assert(html.includes("Last note"));
  assert.doesNotMatch(html, /Sebelumnya|Berikutnya|Halaman|select/);
});
