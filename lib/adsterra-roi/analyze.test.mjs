import assert from "node:assert/strict";
import test from "node:test";
import { buildAdsterraRoiAnalysis } from "./analyze.ts";

const csv = `Waktu Pemesanan,Tag_link1,Tag_link3,Komisi Bersih Affiliate (Rp)\n2026-09-01 10:00:00,TERRA,123,20000`;
test("analysis uses the Shopee-scoped config campaign and source", async () => {
  let request;
  const result = await buildAdsterraRoiAnalysis({ shopeeAccountId: 2, configId: 7, dateFrom: "2026-09-01", dateTill: "2026-09-01", fxRate: "10000", originalFilename: "safe.csv", bytes: new TextEncoder().encode(csv) }, { loadConfig: async (accountId, configId) => ({ id: configId, campaignId: "campaign-77", label: null, sourceTag: "TERRA", shopeeAccountId: accountId }), getStatistics: async (input) => { request = input; return [{ placement: "123", impressions: 1, clicks: 1, spent: "1" }]; } });
  assert.deepEqual(request, { campaignId: "campaign-77", dateFrom: "2026-09-01", dateTill: "2026-09-01" });
  assert.equal(result.analysis.rows[0].commission, "20000");
});

test("analysis rejects cross-account configuration and empty statistics", async () => {
  const input = { shopeeAccountId: 2, configId: 7, dateFrom: "2026-09-01", dateTill: "2026-09-01", fxRate: "10000", originalFilename: "safe.csv", bytes: new TextEncoder().encode(csv) };
  await assert.rejects(buildAdsterraRoiAnalysis(input, { loadConfig: async () => ({ id: 7, campaignId: "77", label: null, sourceTag: "TERRA", shopeeAccountId: 3 }), getStatistics: async () => [] }), /tidak ditemukan/);
  await assert.rejects(buildAdsterraRoiAnalysis(input, { loadConfig: async () => ({ id: 7, campaignId: "77", label: null, sourceTag: "TERRA", shopeeAccountId: 2 }), getStatistics: async () => [] }), /Tidak ada statistik/);
});
