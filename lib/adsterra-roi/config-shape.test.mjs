import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Adsterra provider and campaign config are Shopee scoped", async () => {
  const schema = await readFile(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
  assert.match(schema, /enum TrafficProvider\s*\{[^}]*ADSTERRA/s);
  assert.match(schema, /adsterraCampaignConfigs\s+AdsterraCampaignConfig\[\]/);
  assert.match(schema, /model AdsterraCampaignConfig\s*\{/);
  assert.match(schema, /@@unique\(\[shopeeAccountId, campaignId\]\)/);
  assert.match(schema, /onDelete:\s*Cascade/);
  assert.doesNotMatch(schema, /ADSTERRA_API_KEY/);
});
