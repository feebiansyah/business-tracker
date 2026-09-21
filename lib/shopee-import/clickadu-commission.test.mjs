import assert from "node:assert/strict";
import test from "node:test";

import { aggregateClickaduCommissions } from "./clickadu-commission.ts";

const row = (logicalRow, orderedAt, tagLink1, tagLink3, commission) => ({
  logicalRow, orderedAt, tagLink1, tagLink2: "META-CAMPAIGN", tagLink3, commission,
});

test("matches normalized source tags and aggregates zones by config and date", () => {
  const result = aggregateClickaduCommissions([
    row(2, "2026-09-18 10:00:00", " adu ", "101", "100.125"),
    row(3, "2026-09-18 11:00:00", "ADU", "102", "200.375"),
    row(4, "2026-09-19 10:00:00", "adu", "101", "50"),
    row(5, "2026-09-18 12:00:00", "UNKNOWN", "103", "999"),
    row(6, "2026-09-18 13:00:00", "ADU", "", "999"),
  ], [{ id: 7, sourceTag: "ADU" }]);

  assert.deepEqual(result.map((item) => ({ ...item, commission: item.commission.toFixed(5) })), [
    { clickaduCampaignConfigId: 7, date: "2026-09-18", commission: "300.50000", rowCount: 2 },
    { clickaduCampaignConfigId: 7, date: "2026-09-19", commission: "50.00000", rowCount: 1 },
  ]);
});

test("does not double-count unknown sources", () => {
  const result = aggregateClickaduCommissions([
    row(2, "2026-09-18", "ADU2", "201", "10"),
    row(3, "2026-09-18", "ADU2", "201", "10"),
    row(4, "2026-09-18", "OTHER", "201", "50"),
  ], [{ id: 8, sourceTag: "ADU2" }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].clickaduCampaignConfigId, 8);
  assert.equal(result[0].commission.toFixed(5), "20.00000");
});
