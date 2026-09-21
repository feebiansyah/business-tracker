import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../../prisma/migrations/20260919190000_add_clickadu_daily_commission/migration.sql", import.meta.url), "utf8");

test("Clickadu commission migration is additive and source-tag scoped", () => {
  assert.match(sql, /ADD COLUMN `commissionIdr` DECIMAL\(21, 5\) NULL/);
  assert.match(sql, /UNIQUE INDEX `ClickaduCampaignConfig_shopeeAccountId_sourceTag_key`/);
  assert.match(sql, /`shopeeAccountId`, `sourceTag`/);
  assert.doesNotMatch(sql, /\bDROP\b/i);
  assert.doesNotMatch(sql, /`CampaignDailyMetric`|`MetaAccount`|`ShopeeCommissionImport`/);
});
