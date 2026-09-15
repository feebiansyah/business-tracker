import assert from "node:assert/strict";
import test from "node:test";

import { analyzeAdsterraRoi, aggregateAdsterraCommissions } from "./analysis.ts";
import { decodeAdsterraShopeeCsv } from "./csv.ts";

const csv = `\uFEFFWaktu Pemesanan,Tag_link1,Tag_link3,Komisi Bersih Affiliate (Rp)\n2026-09-01 10:00:00, terra ,100,100.12345\n2026-09-01 11:00:00,TERRA,100,49.87655\n2026-09-02 10:00:00,OTHER,100,999\n2026-09-03 10:00:00,TERRA,200,30\n2026-09-02 10:00:00,TERRA,,50`;

test("Shopee rows filter source/date and aggregate exact commission per placement", () => {
  const result = aggregateAdsterraCommissions(decodeAdsterraShopeeCsv(new TextEncoder().encode(csv)), "TERRA", "2026-09-01", "2026-09-02");
  assert.deepEqual(result.placements, [{ placement: "100", commission: "150.00000", rowCount: 2 }]);
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
