import assert from "node:assert/strict";
import test from "node:test";

import { analyzeClickaduRoi } from "./analysis.ts";

function statistic(zone, spent) {
  return {
    zone,
    impressions: 100,
    clicks: 10,
    conversions: 2,
    conversionsClicks: 2,
    cpa: "0.5",
    cpc: "0.1",
    cpm: "1",
    ctr: "10",
    cr: "20",
    spent,
  };
}

test("matches zone commission and calculates exact cost, profit, ROI, and candidates", () => {
  const result = analyzeClickaduRoi(
    [statistic("A", "1.25"), statistic("B", "2"), statistic("C", "0")],
    [
      { zone: "A", commission: "25000.00001", rowCount: 2 },
      { zone: "C", commission: "100.00000", rowCount: 1 },
    ],
    "16000",
  );

  assert.deepEqual(result.rows.map((row) => row.zone), ["B", "A", "C"]);
  assert.deepEqual(
    result.rows.map(({ zone, spentUsd, costIdr, commission, profit, roi, isBlacklistCandidate }) => ({
      zone,
      spentUsd,
      costIdr,
      commission,
      profit,
      roi,
      isBlacklistCandidate,
    })),
    [
      {
        zone: "B",
        spentUsd: "2",
        costIdr: "32000",
        commission: "0",
        profit: "-32000",
        roi: "-100",
        isBlacklistCandidate: true,
      },
      {
        zone: "A",
        spentUsd: "1.25",
        costIdr: "20000",
        commission: "25000.00001",
        profit: "5000.00001",
        roi: "25.00000005",
        isBlacklistCandidate: true,
      },
      {
        zone: "C",
        spentUsd: "0",
        costIdr: "0",
        commission: "100",
        profit: "100",
        roi: null,
        isBlacklistCandidate: false,
      },
    ],
  );
  assert.deepEqual(result.candidateZones, ["B", "A"]);
  assert.equal(result.totalSpentUsd, "3.25");
  assert.equal(result.totalCostIdr, "52000");
  assert.equal(result.totalCommission, "25100.00001");
  assert.equal(result.totalProfit, "-26899.99999");
  assert.equal(result.roi, "-51.730769211538461538");
});

test("requires at least Rp1.000 cost before making a blacklist decision", () => {
  const result = analyzeClickaduRoi(
    [statistic("999", "0.999"), statistic("1000-loss", "1"), statistic("29", "2"), statistic("30", "3")],
    [
      { zone: "29", commission: "2580", rowCount: 1 },
      { zone: "30", commission: "3900", rowCount: 1 },
    ],
    "1000",
  );

  assert.deepEqual(result.candidateZones, ["29", "1000-loss"]);
  assert.equal(result.rows.find((row) => row.zone === "999").isBlacklistCandidate, false);
  assert.equal(result.rows.find((row) => row.zone === "1000-loss").isBlacklistCandidate, true);
  assert.equal(result.rows.find((row) => row.zone === "29").isBlacklistCandidate, true);
  assert.equal(result.rows.find((row) => row.zone === "30").isBlacklistCandidate, false);
});
