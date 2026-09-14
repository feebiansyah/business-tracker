import assert from "node:assert/strict";
import test from "node:test";
import { candidateZoneText, formatIdr, formatPercent, formatUsd, roiStatusLabel } from "./view-model.ts";

test("formats analysis values and candidate copy text", () => {
  assert.equal(formatIdr("25000.5"), "Rp 25.001");
  assert.equal(formatUsd("1.25"), "$1.25");
  assert.equal(formatPercent("25"), "25,00%");
  assert.equal(candidateZoneText(["2101219", "2141603"]), "2101219, 2141603");
  assert.equal(roiStatusLabel({ isBlacklistCandidate: true, profit: "-1", costIdr: "2" }), "Kandidat Blacklist");
});
