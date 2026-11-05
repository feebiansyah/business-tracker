import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createMetaSettingsRequestGate } from "./meta-campaign-settings-state.ts";

test("request gate blocks concurrent reads and ignores a late response", () => {
  const gate = createMetaSettingsRequestGate();
  const first = gate.begin();
  assert.equal(typeof first, "number");
  assert.equal(gate.begin(), null);
  assert.equal(gate.isCurrent(first), true);
  gate.invalidate();
  assert.equal(gate.isCurrent(first), false);
  const second = gate.begin();
  assert.equal(gate.isCurrent(second), true);
  gate.finish(second);
  assert.equal(gate.begin() !== null, true);
});

test("settings UI loads through the read-only action and renders direct information", async () => {
  const source = await readFile(new URL("./meta-campaign-settings.tsx", import.meta.url), "utf8");
  assert.match(source, /getMetaCampaignSettingsAction/);
  assert.match(source, /Baca ulang/);
  assert.match(source, /Jenis konten/);
  assert.match(source, /Penempatan/);
  assert.match(source, /Umur/);
  assert.match(source, /Lokasi/);
  assert.match(source, /Gender/);
  assert.match(source, /isContentTypeWarning/);
  assert.match(source, /visibleWarnings/);
  assert.match(source, /showPartialNotice/);
  assert.match(source, /warnings\.length === 0/);
  assert.doesNotMatch(source, /\{result\.data\.partial \? <div/);
  assert.doesNotMatch(source, /<details/);
});

test("history modal mounts settings only after its tab is selected", async () => {
  const source = await readFile(new URL("./campaign-history-modal.tsx", import.meta.url), "utf8");
  assert.match(source, /Histori Harian/);
  assert.match(source, /Pengaturan Meta/);
  assert.match(source, /activeTab === "settings" \? <MetaCampaignSettings/);
  assert.match(source, /CampaignDailyDetail/);
});
