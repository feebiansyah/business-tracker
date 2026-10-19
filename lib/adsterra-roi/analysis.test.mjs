import assert from "node:assert/strict";
import test from "node:test";

import { analyzeAdsterraRoi, aggregateAdsterraCommissions } from "./analysis.ts";
import { decodeAdsterraShopeeCsv } from "./csv.ts";
import { buildAdsterraBlacklistTarget } from "./blacklist.ts";
import { AdsterraApiError } from "./client.ts";

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

  assert.deepEqual(result.candidatePlacements, ["1000-loss"]);
  assert.equal(result.rows.find((row) => row.placement === "999").isBlacklistCandidate, false);
  assert.equal(result.rows.find((row) => row.placement === "1000-loss").isBlacklistCandidate, true);
  assert.equal(result.rows.find((row) => row.placement === "29").isBlacklistCandidate, false);
  assert.equal(result.rows.find((row) => row.placement === "30").isBlacklistCandidate, false);
});

const decisionCases = [
  { name: "spend 999 stays excluded", cost: "999", commission: "1498.5", impressions: 100, clicks: 15, candidate: false },
  { name: "ROI 15 and CTR 10 is safe", cost: "2000", commission: "2300", impressions: 100, clicks: 10, candidate: false },
  { name: "ROI exactly 10 is blacklisted", cost: "2000", commission: "2200", impressions: 100, clicks: 10, candidate: true },
  { name: "CTR exactly 8 is blacklisted", cost: "2000", commission: "2300", impressions: 100, clicks: 8, candidate: true },
  { name: "ROI 5 and CTR 12 is blacklisted", cost: "2000", commission: "2100", impressions: 100, clicks: 12, candidate: true },
  { name: "ROI 20 and CTR 5 is blacklisted", cost: "2000", commission: "2400", impressions: 100, clicks: 5, candidate: true },
  { name: "ROI 10.01 and CTR 8.01 is safe", cost: "2000", commission: "2200.2", impressions: 10000, clicks: 801, candidate: false },
  { name: "spend exactly 1000 is eligible", cost: "1000", commission: "1100", impressions: 100, clicks: 10, candidate: true },
  { name: "spend 999.99999 stays excluded", cost: "999.99999", commission: "0", impressions: 100, clicks: 0, candidate: false },
  { name: "zero impressions cannot be safe", cost: "2000", commission: "3000", impressions: 0, clicks: 0, candidate: true },
  { name: "zero impressions with clicks cannot divide by zero", cost: "2000", commission: "3000", impressions: 0, clicks: 5, candidate: true },
  { name: "zero spend keeps existing exclusion", cost: "0", commission: "100", impressions: 0, clicks: 0, candidate: false },
];

for (const fixture of decisionCases) {
  test(`Adsterra analysis and blacklist target: ${fixture.name}`, () => {
    const result = analyzeAdsterraRoi([
      { placement: "123", spent: fixture.cost, impressions: fixture.impressions, clicks: fixture.clicks },
    ], [{ placement: "123", commission: fixture.commission, rowCount: 1 }], "1");
    assert.equal(result.rows[0].isBlacklistCandidate, fixture.candidate);
    assert.deepEqual(result.candidatePlacements, fixture.candidate ? ["123"] : []);
    assert.deepEqual(buildAdsterraBlacklistTarget([], result.rows).targetPlacementIds, fixture.candidate ? [123] : []);
  });
}

test("Adsterra uses aggregated clicks and impressions for placement CTR", () => {
  const result = analyzeAdsterraRoi([
    { placement: "123", spent: "1000", impressions: 100, clicks: 20 },
    { placement: "123", spent: "1000", impressions: 900, clicks: 0 },
  ], [{ placement: "123", commission: "2300", rowCount: 1 }], "1");
  assert.equal(result.rows[0].impressions, 1000);
  assert.equal(result.rows[0].clicks, 20);
  assert.equal(result.rows[0].isBlacklistCandidate, true);
});

for (const field of ["clicks", "impressions"]) {
  test(`Adsterra rejects ${field} aggregation overflow`, () => {
    assert.throws(() => analyzeAdsterraRoi([
      { placement: "123", spent: "1000", clicks: 10, impressions: 100, [field]: Number.MAX_VALUE },
      { placement: "123", spent: "1000", clicks: 10, impressions: 100, [field]: Number.MAX_VALUE },
    ], [], "1"), (error) => error instanceof AdsterraApiError && error.message.includes(field));
  });

  for (const value of [-1, NaN, Infinity, 0.5]) {
    test(`Adsterra rejects invalid aggregate ${field}: ${value}`, () => {
      assert.throws(() => analyzeAdsterraRoi([
        { placement: "123", spent: "1000", clicks: 10, impressions: 100, [field]: value },
      ], [], "1"), (error) => error instanceof AdsterraApiError && error.message.includes(field));
    });
  }
}
