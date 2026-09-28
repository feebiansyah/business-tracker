import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./adsterra-campaign-controls.tsx", import.meta.url), "utf8").catch(() => "");
const page = await readFile(new URL("../../app/page.tsx", import.meta.url), "utf8");

test("Dashboard exposes a dedicated Adsterra control section without history interaction", () => {
  assert.match(page, /<AdsterraCampaignControls accounts=/);
  assert.match(source, /Kontrol Adsterra/);
  assert.match(source, /Belum ada campaign Adsterra/);
  assert.doesNotMatch(source, /History|HistoryModal|setSelected|onClick=.*campaignName/);
});

test("Dashboard reuses authenticated Adsterra status and verified toggle actions", () => {
  assert.match(source, /getAdsterraCampaignStatusesAction/);
  assert.match(source, /setAdsterraCampaignActiveAction/);
  assert.doesNotMatch(source, /getAdsterraClient|decryptTrafficSecret|fetch\(/);
  assert.match(source, /if \(result\.campaignStatus\)/);
  assert.match(source, /togglingIds\.has\(campaign\.id\)/);
});

test("Dashboard renders all provider statuses and isolates per-campaign errors", () => {
  for (const label of ["Active", "Inactive", "Limit", "Not in use", "Tidak diketahui"]) {
    assert.match(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(source, /status === "ACTIVE" \|\| status === "INACTIVE" \|\| status === "LIMITED"/);
  assert.doesNotMatch(source, /status === "NOT_IN_USE" \|\|/);
  assert.match(source, /item\.error/);
  assert.match(source, /\[item\.configId,/);
});

