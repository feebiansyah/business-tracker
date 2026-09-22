import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schema = await readFile(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
const migration = await readFile(new URL("../../prisma/migrations/20260921220000_add_adsterra_auto_schedule_foundation/migration.sql", import.meta.url), "utf8");

test("Adsterra automation is opt-in and schedule runs have an idempotent identity", () => {
  assert.match(schema, /model AdsterraCampaignConfig[\s\S]*?autoScheduleEnabled\s+Boolean\s+@default\(false\)/);
  assert.match(schema, /model AdsterraCampaignConfig[\s\S]*?scheduleRuns\s+AdsterraCampaignScheduleRun\[\]/);
  assert.match(schema, /model AdsterraCampaignScheduleRun[\s\S]*?businessDate\s+DateTime\s+@db\.Date/);
  assert.match(schema, /@@unique\(\[adsterraCampaignConfigId, businessDate, action\], map: "AdsterraScheduleRun_config_date_action_key"\)/);
  assert.match(schema, /onDelete: Cascade/);
});

test("schedule foundation migration is additive and Adsterra-only", () => {
  assert.match(migration, /ADD COLUMN `autoScheduleEnabled` BOOLEAN NOT NULL DEFAULT false/);
  assert.match(migration, /CREATE TABLE `AdsterraCampaignScheduleRun`/);
  assert.match(migration, /UNIQUE INDEX `AdsterraScheduleRun_config_date_action_key`/);
  assert.match(migration, /REFERENCES `AdsterraCampaignConfig`\(`id`\) ON DELETE CASCADE/);
  assert.doesNotMatch(migration, /\bDROP\b|CampaignDailyMetric|MetaAccount|ShopeeAccount|ClickaduCampaignConfig/);
});
