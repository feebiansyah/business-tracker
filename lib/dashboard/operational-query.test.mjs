import assert from "node:assert/strict";
import test from "node:test";
import { getOperationalDashboard } from "./operational-query.ts";

test("operational dashboard uses one scoped database load with D-1 coverage filters", async () => {
  let calls = 0;
  let query;
  const db = { shopeeAccount: { findMany: async (args) => { calls += 1; query = args; return []; } } };
  const result = await getOperationalDashboard(new Date("2026-09-12T05:00:00.000Z"), db);
  assert.equal(calls, 1);
  assert.equal(result.targetDate, "2026-09-11");
  assert.deepEqual(query.select.metaAccounts.select._count.select.campaigns.where, { metaStatus: "ACTIVE" });
  assert.equal(query.select.commissionImports.take, 1);
  assert.equal(query.select.clickImports.take, 1);
  assert.deepEqual(query.select.adsterraCampaignConfigs.select, { id: true, campaignId: true, label: true });
  assert.equal(query.select.commissionImports.where.dateFrom.lte.toISOString().slice(0, 10), "2026-09-11");
  assert.equal(query.select.commissionImports.where.dateTo.gte.toISOString().slice(0, 10), "2026-09-11");
});

test("operational dashboard returns minimal Adsterra campaign metadata per Shopee account", async () => {
  const db = {
    shopeeAccount: {
      findMany: async () => [{
        id: 7,
        name: "Shopee Terra",
        metaAccounts: [],
        commissionImports: [],
        clickImports: [],
        adsterraCampaignConfigs: [
          { id: 11, campaignId: "terra-11", label: "Campaign A" },
          { id: 12, campaignId: "terra-12", label: null },
        ],
      }],
    },
  };

  const result = await getOperationalDashboard(new Date("2026-09-12T05:00:00.000Z"), db);
  assert.deepEqual(result.accounts[0].adsterraCampaigns, [
    { id: 11, campaignId: "terra-11", label: "Campaign A" },
    { id: 12, campaignId: "terra-12", label: null },
  ]);
});

test("root dashboard reads only the operational database query and no Meta client", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /getOperationalDashboard/);
  assert.doesNotMatch(source, /MetaGraphClient|getDashboardData|getCampaignInsights|getAccountDailySpend/);
});
