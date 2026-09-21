import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./campaign-report-list.tsx", import.meta.url), "utf8");

test("Adsterra campaign list renders API status and conservative actions", () => {
  for (const label of ["Status", "Aksi", "Active", "Inactive", "Limit", "Not in use", "Refresh Status", "Memproses..."]) {
    assert.match(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(source, /status === "ACTIVE"/);
  assert.match(source, /status === "INACTIVE"/);
  assert.doesNotMatch(source, /status === "LIMITED"[^\n]*setCampaign/);
  assert.match(source, /toggleLocks\.current\.has\(campaign\.id\)/);
});
