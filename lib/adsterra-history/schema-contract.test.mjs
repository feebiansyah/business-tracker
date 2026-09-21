import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const schema = await readFile(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
const migration = await readFile(new URL("../../prisma/migrations/20260921190000_add_adsterra_daily_metrics/migration.sql", import.meta.url), "utf8");
test("Adsterra daily schema is isolated and sourceTag is account-unique", () => { assert.match(schema, /model AdsterraCampaignDailyMetric/); assert.match(schema, /historySyncedThrough\s+DateTime\?\s+@db\.Date/); assert.match(schema, /@@unique\(\[adsterraCampaignConfigId, date\]\)/); assert.match(schema, /@@unique\(\[shopeeAccountId, sourceTag\]\)/); });
test("daily migration is additive and Adsterra-only", () => { assert.match(migration, /CREATE TABLE `AdsterraCampaignDailyMetric`/); assert.match(migration, /ADD COLUMN `historySyncedThrough`/); assert.match(migration, /ON DELETE CASCADE/); assert.doesNotMatch(migration, /\bDROP\b|`CampaignDailyMetric`|`MetaAccount`|`ClickaduCampaign/); });
