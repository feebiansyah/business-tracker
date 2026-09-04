import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { campaignMatchesMode, campaignModeConfig, campaignModes } from "./campaign-modes.ts";

test("four workspace modes classify ACTIVE status and the 200000 budget boundary", () => {
  assert.equal(campaignMatchesMode("filter", "ACTIVE", 199999), true);
  assert.equal(campaignMatchesMode("filter", "ACTIVE", 200000), false);
  assert.equal(campaignMatchesMode("fix", "ACTIVE", 199999), false);
  assert.equal(campaignMatchesMode("fix", "ACTIVE", 200000), true);
  assert.equal(campaignMatchesMode("off-filter", "PAUSED", 199999), true);
  assert.equal(campaignMatchesMode("off-filter", "ACTIVE", 199999), false);
  assert.equal(campaignMatchesMode("off-fix", "ARCHIVED", 200000), true);
  assert.equal(campaignMatchesMode("off-fix", "ACTIVE", 200000), false);
});

test("all modes exclude unresolved budgets and OFF includes every non-ACTIVE status", () => {
  for (const mode of campaignModes) assert.equal(campaignMatchesMode(mode, "ACTIVE", null), false);
  assert.equal(campaignMatchesMode("off-filter", null, 100000), true);
  assert.equal(campaignMatchesMode("off-fix", "DELETED", 200000), true);
});

test("workspace mode maps route and title without duplicate stacks", () => {
  assert.deepEqual(campaignModes.map((mode) => campaignModeConfig[mode].route), ["filter", "fix", "off-filter", "off-fix"]);
  assert.deepEqual(campaignModes.map((mode) => campaignModeConfig[mode].title), ["Filter", "Fix", "OFF Filter", "OFF Fix"]);
});

test("shared query keeps ownership, aggregate-safe date joins, and global pagination", async () => {
  const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");
  assert.match(source, /ma\.shopeeAccountId = \$\{shopeeAccountId\}/);
  assert.match(source, /metaAccount: \{ shopeeAccountId \}/);
  const join = source.indexOf("LEFT JOIN CampaignDailyMetric");
  const where = source.indexOf("WHERE ma.shopeeAccountId", join);
  assert.match(source.slice(join, where), /dm\.date >=/);
  assert.match(source.slice(join, where), /dm\.date <=/);
  assert.match(source, /ORDER BY[\s\S]*LIMIT[\s\S]*OFFSET/);
  assert.match(source, /startTime/);
  assert.match(source, /metaAccountId/);
});

test("all routes are thin wrappers over the shared workspace", async () => {
  for (const mode of campaignModes) {
    const source = await readFile(new URL(`../../app/shopee/[id]/${mode}/page.tsx`, import.meta.url), "utf8");
    assert.match(source, /CampaignWorkspacePage/);
    assert.match(source, new RegExp(`mode="${mode}"`));
  }
});

test("empty and missing-detail messages use the selected campaign mode title", async () => {
  const table = await readFile(new URL("../../components/filter/filter-table.tsx", import.meta.url), "utf8");
  const actions = await readFile(new URL("../../app/shopee/[id]/filter/actions.ts", import.meta.url), "utf8");
  const detailAction = actions.slice(actions.indexOf("getFilterCampaignDetailAction"), actions.indexOf("updateDailyMetricManualAction"));
  assert.match(table, /campaignModeConfig\[mode\]\.title/);
  assert.doesNotMatch(table, /memenuhi Filter/);
  assert.match(detailAction, /campaignModeConfig\[mode\]\.title/);
  assert.doesNotMatch(detailAction, /scope Filter/);
});
