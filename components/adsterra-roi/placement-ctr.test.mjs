import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { formatPlacementCtr, formatPlacementCpm } from "./placement-ctr.ts";

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
  assert.match(source, /"ROI", "CTR", "Custom Bid \(ID \/ GLOBAL\)", "CPM \(USD\)", "Status"/);
  assert.match(source, /formatPercent\(row\.roi\)[\s\S]*formatPlacementCtr\(row\.clicks, row\.impressions\)[\s\S]*row\.isBlacklistCandidate/);
  assert.match(source, /overflow-x-auto/);
  assert.match(source, /TrafficRoiPagination totalRows=\{analysis\.rows\.length\}/);
});

for (const { spend, impressions, expected } of [
  { spend: "1.25", impressions: 10000, expected: "$0.1250" },
  { spend: "0.000001", impressions: 1, expected: "$0.0010" },
  { spend: "12.7793", impressions: 0, expected: "N/A" },
  { spend: "0", impressions: 1000, expected: "$0.0000" },
  { spend: "1", impressions: 3, expected: "$333.3333" },
  { spend: "0.0000000001", impressions: 1000, expected: "$0.0000" },
]) {
  test(`CPM USD spend ${spend} / impressions ${impressions} -> ${expected}`, () => {
    assert.equal(formatPlacementCpm(spend, impressions), expected);
  });
}

test("Adsterra placement CPM appears immediately after Custom Bid without altering decisions", async () => {
  const source = await readFile(new URL("./placement-table.tsx", import.meta.url), "utf8");
  assert.match(source, /"Custom Bid \(ID \/ GLOBAL\)", "CPM \(USD\)", "Status"/);
  assert.match(source, /formatPlacementCpm\(row\.spentUsd, row\.impressions\)/);
  assert.match(source, /row\.isBlacklistCandidate/);
  assert.match(source, /TrafficRoiPagination totalRows=\{analysis\.rows\.length\}/);
});
