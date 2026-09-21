import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./campaign-report-list.tsx", import.meta.url), "utf8");

test("Adsterra campaign list exposes the correct action for every API status", () => {
  for (const label of ["Status", "Aksi", "Active", "Inactive", "Limit", "Not in use", "Refresh Status"]) {
    assert.match(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(source, /status === "ACTIVE" \|\| status === "INACTIVE" \|\| status === "LIMITED"/);
  assert.match(source, /desiredActive: status === "INACTIVE"/);
  assert.match(source, /variant=\{status === "INACTIVE" \? "default" : "destructive"\}/);
  assert.doesNotMatch(source, /status === "NOT_IN_USE" \|\|/);
  assert.match(source, /toggleLocks\.current\.has\(campaign\.id\)/);
});

test("Power action opens an AlertDialog and PATCH remains behind explicit confirmation", () => {
  assert.match(source, /<Power/);
  assert.match(source, /setPendingToggle\(\{ campaign, desiredActive:/);
  assert.match(source, /<AlertDialog/);
  assert.match(source, /Matikan campaign\?/);
  assert.match(source, /Aktifkan campaign\?/);
  assert.match(source, /onConfirm=\{confirmToggle\}/);
  assert.match(source, /await toggleCampaign\(pendingToggle\.campaign, pendingToggle\.desiredActive\)/);
  assert.doesNotMatch(source, /onClick=\{\(\) => void toggleCampaign/);
});

test("confirmation keeps synchronous locking, loading, cancellation, and verified status updates", () => {
  assert.match(source, /if \(toggleLocks\.current\.has\(campaign\.id\)\) return false/);
  assert.match(source, /disabled=\{toggling \|\| statusesBusy\}/);
  assert.match(source, /busy=\{confirmationBusy\}/);
  assert.match(source, /onCancel=\{\(\) => setPendingToggle\(null\)\}/);
  assert.match(source, /if \(result\.campaignStatus\) setStatusByConfig/);
  assert.match(source, /if \(success\) setPendingToggle\(null\)/);
});
