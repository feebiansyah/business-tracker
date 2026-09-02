import assert from "node:assert/strict";
import test from "node:test";
import Decimal from "decimal.js";
import { matchCommissionAggregates } from "./matching.ts";

function aggregate(date, tagLink2, commission) {
  return {
    date,
    tagLink2,
    normalizedTagLink2: tagLink2.trim().toUpperCase(),
    commission: new Decimal(commission),
    rowCount: 1,
  };
}

test("matches exactly one normalized campaign and classifies missing or duplicate names", () => {
  const aggregates = [
    aggregate("2026-09-01", "A-1", "10"),
    aggregate("2026-09-01", "B_2", "20"),
    aggregate("2026-09-02", "C 3", "30"),
  ];
  const result = matchCommissionAggregates(aggregates, [
    { id: 11, name: " a-1 " },
    { id: 21, name: "B_2" },
    { id: 22, name: "b_2" },
  ]);

  assert.deepEqual(
    result.matched.map((row) => [row.campaignId, row.date]),
    [[11, "2026-09-01"]],
  );
  assert.deepEqual(
    result.unmatched.map((row) => row.reason),
    ["AMBIGUOUS_CAMPAIGN_NAME", "CAMPAIGN_NOT_FOUND"],
  );
  assert.equal(result.matchedCommission.toFixed(2), "10.00");
  assert.equal(result.unmatchedCommission.toFixed(2), "50.00");
});

test("campaign matching normalizes only edge whitespace and case", () => {
  const result = matchCommissionAggregates(
    [aggregate("2026-09-01", "A- 1", "25")],
    [{ id: 31, name: " a-1 " }],
  );

  assert.equal(result.matched.length, 0);
  assert.equal(result.unmatched[0].reason, "CAMPAIGN_NOT_FOUND");
});
