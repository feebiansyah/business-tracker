import assert from "node:assert/strict";
import test from "node:test";
import { aggregateCommissionRows } from "./aggregate.ts";

test("groups by date and normalized tag with exact sums and row counts", () => {
  const result = aggregateCommissionRows([
    {
      logicalRow: 2,
      orderedAt: "2026-09-01 10:00",
      tagLink2: " Ab-1 ",
      commission: "0.10",
    },
    {
      logicalRow: 3,
      orderedAt: "2026-09-01 11:00",
      tagLink2: "ab-1",
      commission: "0.20",
    },
    {
      logicalRow: 4,
      orderedAt: "2026-09-02 09:00",
      tagLink2: "X_2",
      commission: "1.000",
    },
  ]);

  assert.equal(result.csvRowCount, 3);
  assert.equal(result.tagCount, 2);
  assert.equal(result.dateFrom, "2026-09-01");
  assert.equal(result.dateTo, "2026-09-02");
  assert.equal(result.totalCommission.toFixed(2), "1000.30");
  assert.deepEqual(
    result.aggregates.map((row) => [
      row.date,
      row.normalizedTagLink2,
      row.commission.toFixed(2),
      row.rowCount,
    ]),
    [
      ["2026-09-01", "AB-1", "0.30", 2],
      ["2026-09-02", "X_2", "1000.00", 1],
    ],
  );
});

test("retains first trimmed display tag and sums zero and negative rows", () => {
  const result = aggregateCommissionRows([
    {
      logicalRow: 2,
      orderedAt: "2026-09-01",
      tagLink2: " First-Tag ",
      commission: "10.00",
    },
    {
      logicalRow: 3,
      orderedAt: "2026-09-01",
      tagLink2: "first-tag",
      commission: "-2.50",
    },
    {
      logicalRow: 4,
      orderedAt: "2026-09-01",
      tagLink2: "FIRST-TAG",
      commission: "0",
    },
  ]);

  assert.equal(result.aggregates[0].tagLink2, "First-Tag");
  assert.equal(result.aggregates[0].commission.toFixed(2), "7.50");
  assert.equal(result.aggregates[0].rowCount, 3);
});
