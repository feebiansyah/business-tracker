import assert from "node:assert/strict";
import test from "node:test";
import { createCommissionCoverageLookup, hasCommissionCoverage } from "./commission-coverage.ts";

test("commission coverage is exact per campaign and date within one Shopee account", () => {
  const coverage = createCommissionCoverageLookup([
    { campaignId: 101, date: "2026-08-10" },
  ]);

  assert.equal(hasCommissionCoverage(coverage, 101, "2026-08-10"), true);
  assert.equal(hasCommissionCoverage(coverage, 202, "2026-08-10"), false);
  assert.equal(hasCommissionCoverage(coverage, 101, "2026-08-11"), false);

  const afterSecondImport = createCommissionCoverageLookup([
    { campaignId: 101, date: "2026-08-10" },
    { campaignId: 202, date: "2026-08-10" },
  ]);
  assert.equal(hasCommissionCoverage(afterSecondImport, 202, "2026-08-10"), true);
});
