import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { modalShouldClose } from "./campaign-history-modal-state.ts";

test("campaign history modal closes only for overlay, close button, or Escape", () => {
  assert.equal(modalShouldClose("overlay"), true);
  assert.equal(modalShouldClose("close-button"), true);
  assert.equal(modalShouldClose("keydown", "Escape"), true);
  assert.equal(modalShouldClose("content"), false);
  assert.equal(modalShouldClose("keydown", "Enter"), false);
});

test("modal keeps the existing detail route and existing Note/Selesai table flow", async () => {
  const modal = await readFile(new URL("./campaign-history-modal.tsx", import.meta.url), "utf8");
  const filterTable = await readFile(new URL("./filter-table.tsx", import.meta.url), "utf8");
  const detailRoute = await readFile(new URL("../../app/shopee/[id]/filter/[campaignId]/page.tsx", import.meta.url), "utf8");
  const sharedDetail = await readFile(new URL("./campaign-workspace-detail-page.tsx", import.meta.url), "utf8");
  assert.match(modal, /CampaignDailyDetail/);
  assert.match(modal, /stopPropagation/);
  assert.match(modal, /campaignModeConfig\[mode\]\.route/);
  assert.match(filterTable, /setSelectedCampaign/);
  assert.match(filterTable, /CampaignHistoryModal/);
  assert.match(detailRoute, /CampaignWorkspaceDetailPage/);
  assert.match(detailRoute, /mode="filter"/);
  assert.match(sharedDetail, /CampaignDailyDetail/);
});
