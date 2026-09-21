import assert from "node:assert/strict";
import test from "node:test";
import { aggregateAdsterraCommissions } from "./adsterra-commission.ts";

const row = (logicalRow, orderedAt, tagLink1, tagLink3, commission) => ({ logicalRow, orderedAt, tagLink1, tagLink2: "META", tagLink3, commission });
test("TERRA routes by normalized source tag and aggregates placements per config/date", () => {
  const result = aggregateAdsterraCommissions([
    row(2, "2026-09-18 10:00", " terra ", "101", "100.125"),
    row(3, "2026-09-18 11:00", "TERRA", "102", "200.375"),
    row(4, "2026-09-19 10:00", "terra", "103", "50"),
    row(5, "2026-09-18", "OTHER", "104", "999"),
    row(6, "2026-09-18", "TERRA", "", "999"),
  ], [{ id: 9, sourceTag: "TERRA" }]);
  assert.deepEqual(result.map((x) => ({ ...x, commission: x.commission.toFixed(5) })), [
    { adsterraCampaignConfigId: 9, date: "2026-09-18", commission: "300.50000", rowCount: 2 },
    { adsterraCampaignConfigId: 9, date: "2026-09-19", commission: "50.00000", rowCount: 1 },
  ]);
});
