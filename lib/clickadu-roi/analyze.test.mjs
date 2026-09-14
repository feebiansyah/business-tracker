import assert from "node:assert/strict";
import test from "node:test";

import { buildClickaduRoiAnalysis, publicClickaduAnalysisMessage } from "./analyze.ts";

const csv = `Tag_link1,Tag_link3,Komisi Bersih Affiliate (Rp)\n ADU ,101,25000\nOTHER,102,99999\n`;

test("analysis reloads scoped config and uses its campaign and source", async () => {
  const calls = [];
  const result = await buildClickaduRoiAnalysis({
    shopeeAccountId: 2, configId: 7, dateFrom: "2026-09-01", dateTill: "2026-09-02",
    fxRate: "16000", originalFilename: "roi.csv", bytes: new TextEncoder().encode(csv),
  }, {
    loadConfig: async (accountId, configId) => { calls.push(["config", accountId, configId]); return { id: 7, shopeeAccountId: 2, campaignId: "server-campaign", label: "Campaign A", sourceTag: "ADU" }; },
    getStatistics: async (input) => { calls.push(["api", input]); return [{ zone: "101", impressions: 100, clicks: 5, conversions: 0, conversionsClicks: 0, cpa: "0", cpc: "0.2", cpm: "1", ctr: "5", cr: "0", spent: "1" }]; },
  });
  assert.deepEqual(calls, [["config", 2, 7], ["api", { campaignIds: ["server-campaign"], dateFrom: "2026-09-01", dateTill: "2026-09-02" }]]);
  assert.equal(result.analysis.totalCostIdr, "16000");
  assert.equal(result.analysis.totalCommission, "25000");
  assert.equal(result.analysis.totalProfit, "9000");
  assert.equal(result.csv.processedRowCount, 1);
  assert.equal("bytes" in result, false);
});

test("analysis rejects invalid input and cross-account config before API", async () => {
  let apiCalls = 0;
  const deps = { loadConfig: async () => null, getStatistics: async () => { apiCalls++; return []; } };
  await assert.rejects(() => buildClickaduRoiAnalysis({ shopeeAccountId: 2, configId: 8, dateFrom: "2026-09-02", dateTill: "2026-09-01", fxRate: "16000", originalFilename: "x.csv", bytes: new Uint8Array() }, deps), /Rentang tanggal/);
  await assert.rejects(() => buildClickaduRoiAnalysis({ shopeeAccountId: 2, configId: 8, dateFrom: "2026-09-01", dateTill: "2026-09-02", fxRate: "0", originalFilename: "x.csv", bytes: new Uint8Array() }, deps), /lebih dari 0/);
  await assert.rejects(() => buildClickaduRoiAnalysis({ shopeeAccountId: 2, configId: 8, dateFrom: "2026-09-01", dateTill: "2026-09-02", fxRate: "16000", originalFilename: "x.csv", bytes: new TextEncoder().encode(csv) }, deps), /tidak ditemukan/);
  assert.equal(apiCalls, 0);
});

test("unknown API errors are sanitized", () => {
  assert.equal(publicClickaduAnalysisMessage(new Error("secret-token response")), "Gagal menganalisis Clickadu ROI.");
  assert.doesNotMatch(publicClickaduAnalysisMessage(new Error("secret-token response")), /secret-token/);
});

test("missing Clickadu connection fails with a safe message", () => {
  assert.equal(publicClickaduAnalysisMessage(new Error("CLICKADU credential missing for account 2")), "Gagal menganalisis Clickadu ROI.");
});
