import assert from "node:assert/strict";
import test from "node:test";

import { analyzeAdsterraRoi, aggregateAdsterraCommissions } from "./analysis.ts";
import { decodeAdsterraShopeeCsv } from "./csv.ts";

const csv = `\uFEFFWaktu Pemesanan,Tag_link1,Tag_link3,Komisi Bersih Affiliate (Rp)\n2026-09-01 10:00:00, terra ,100,100.12345\n2026-09-01 11:00:00,TERRA,100,49.87655\n2026-09-02 10:00:00,OTHER,100,999\n2026-09-03 10:00:00,TERRA,200,30\n2026-09-02 10:00:00,TERRA,,50`;

test("Shopee rows filter source/date and aggregate exact commission per placement", () => {
  const result = aggregateAdsterraCommissions(decodeAdsterraShopeeCsv(new TextEncoder().encode(csv)), "TERRA", "2026-09-01", "2026-09-03");
  assert.deepEqual(result.placements, [{ placement: "100", commission: "150.00000", rowCount: 2 }, { placement: "200", commission: "30.00000", rowCount: 1 }]);
});

test("Adsterra period filters CSV transactions without requiring boundary rows", () => {
  const partialRows = decodeAdsterraShopeeCsv(new TextEncoder().encode(`Waktu Pemesanan,Tag_link1,Tag_link3,Komisi Bersih Affiliate (Rp)\n2026-09-12 10:00:00,TERRA,100,10\n2026-09-15 10:00:00,TERRA,200,20`));
  assert.deepEqual(aggregateAdsterraCommissions(partialRows, "TERRA", "2026-09-01", "2026-09-15").placements.map((row) => row.placement), ["100", "200"]);

  const mixedRows = decodeAdsterraShopeeCsv(new TextEncoder().encode(`Waktu Pemesanan,Tag_link1,Tag_link3,Komisi Bersih Affiliate (Rp)\n2026-08-31 10:00:00,TERRA,50,5\n2026-09-12 10:00:00,TERRA,100,10\n2026-09-16 10:00:00,TERRA,300,30`));
  assert.deepEqual(aggregateAdsterraCommissions(mixedRows, "TERRA", "2026-09-01", "2026-09-15").placements.map((row) => row.placement), ["100"]);
  assert.throws(() => aggregateAdsterraCommissions(mixedRows, "TERRA", "2026-09-01", "2026-09-10"), /CSV Shopee tidak memiliki data pada periode yang dipilih/);
});

test("Adsterra ROI aggregates duplicate placements, calculates exact values, and sorts spend descending", () => {
  const result = analyzeAdsterraRoi([
    { placement: "100", impressions: 100, clicks: 10, spent: "1" },
    { placement: "100", impressions: 50, clicks: 5, spent: "0.5" },
    { placement: "200", impressions: 20, clicks: 2, spent: "0" },
    { placement: "300", impressions: 10, clicks: 1, spent: "2" },
  ], [{ placement: "100", commission: "30000", rowCount: 2 }], "10000");
  assert.deepEqual(result.rows.map((row) => row.placement), ["300", "100", "200"]);
  const matched = result.rows[1];
  assert.deepEqual({ spent: matched.spentUsd, cost: matched.costIdr, commission: matched.commission, profit: matched.profit, roi: matched.roi, impressions: matched.impressions, clicks: matched.clicks }, { spent: "1.5", cost: "15000", commission: "30000", profit: "15000", roi: "100", impressions: 150, clicks: 15 });
  assert.equal(result.rows[0].isBlacklistCandidate, true);
  assert.equal(result.rows[2].roi, null);
  assert.equal(result.rows[2].isBlacklistCandidate, false);
});

test("Adsterra requires at least Rp1.000 cost before making a blacklist decision", () => {
  const result = analyzeAdsterraRoi([
    { placement: "999", impressions: 1, clicks: 1, spent: "0.999" },
    { placement: "1000-loss", impressions: 1, clicks: 1, spent: "1" },
    { placement: "29", impressions: 1, clicks: 1, spent: "2" },
    { placement: "30", impressions: 1, clicks: 1, spent: "3" },
  ], [
    { placement: "29", commission: "2580", rowCount: 1 },
    { placement: "30", commission: "3900", rowCount: 1 },
  ], "1000");

  assert.deepEqual(result.candidatePlacements, ["29", "1000-loss"]);
  assert.equal(result.rows.find((row) => row.placement === "999").isBlacklistCandidate, false);
  assert.equal(result.rows.find((row) => row.placement === "1000-loss").isBlacklistCandidate, true);
  assert.equal(result.rows.find((row) => row.placement === "29").isBlacklistCandidate, true);
  assert.equal(result.rows.find((row) => row.placement === "30").isBlacklistCandidate, false);
});
