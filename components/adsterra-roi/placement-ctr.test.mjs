import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { formatPlacementCtr } from "./placement-ctr.ts";

for (const { clicks, impressions, expected } of [
  { clicks: 10, impressions: 100, expected: "10,00%" },
  { clicks: 8, impressions: 100, expected: "8,00%" },
  { clicks: 801, impressions: 10000, expected: "8,01%" },
  { clicks: 1, impressions: 3, expected: "33,33%" },
  { clicks: 0, impressions: 100, expected: "0,00%" },
  { clicks: 0, impressions: 0, expected: "N/A" },
  { clicks: 5, impressions: 0, expected: "N/A" },
]) {
  test(`placement CTR display: ${clicks}/${impressions} = ${expected}`, () => {
    assert.equal(formatPlacementCtr(clicks, impressions), expected);
  });
}

test("placement table shows aggregate CTR between ROI and Status and keeps horizontal scrolling", async () => {
  const source = await readFile(new URL("./placement-table.tsx", import.meta.url), "utf8");
  assert.match(source, /"ROI", "CTR", "Custom Bid \(ID \/ GLOBAL\)", "Status"/);
  assert.match(source, /formatPercent\(row\.roi\)[\s\S]*formatPlacementCtr\(row\.clicks, row\.impressions\)[\s\S]*row\.isBlacklistCandidate/);
  assert.match(source, /overflow-x-auto/);
  assert.match(source, /TrafficRoiPagination totalRows=\{analysis\.rows\.length\}/);
});
