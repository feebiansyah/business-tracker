import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("checkpoint migration is additive and Clickadu-only", async () => {
  const sql = await readFile(new URL("../../prisma/migrations/20260921090000_add_clickadu_history_checkpoint/migration.sql", import.meta.url), "utf8");
  assert.match(sql, /ALTER TABLE `ClickaduCampaignConfig`/);
  assert.match(sql, /ADD COLUMN `historySyncedThrough` DATE NULL/);
  assert.doesNotMatch(sql, /DROP|CampaignDailyMetric|MetaAccount|ShopeeCommission/i);
});
