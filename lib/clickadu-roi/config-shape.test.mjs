import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");

function model(name) {
  const body = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1];
  assert.ok(body, `Model ${name} must exist`);
  return body;
}

test("Clickadu campaign configuration is additive and Shopee scoped", () => {
  const shopee = model("ShopeeAccount");
  const config = model("ClickaduCampaignConfig");

  assert.match(shopee, /clickaduCampaignConfigs\s+ClickaduCampaignConfig\[\]/);
  assert.match(config, /id\s+Int\s+@id\s+@default\(autoincrement\(\)\)/);
  assert.match(config, /campaignId\s+String\s+@db\.VarChar\(64\)/);
  assert.match(config, /label\s+String\?\s+@db\.VarChar\(191\)/);
  assert.match(config, /sourceTag\s+String\s+@db\.VarChar\(64\)/);
  assert.match(config, /createdAt\s+DateTime\s+@default\(now\(\)\)/);
  assert.match(config, /updatedAt\s+DateTime\s+@updatedAt/);
  assert.match(config, /shopeeAccountId\s+Int/);
  assert.match(config, /shopeeAccount\s+ShopeeAccount\s+@relation\(fields: \[shopeeAccountId\], references: \[id\], onDelete: Cascade\)/);
  assert.match(config, /@@unique\(\[shopeeAccountId, campaignId\]\)/);
  assert.match(config, /@@index\(\[shopeeAccountId\]\)/);
  assert.doesNotMatch(config, /token|secret/i);
});

test("Prisma client generator remains unchanged", () => {
  assert.match(schema, /generator client\s*\{\s*provider\s*=\s*"prisma-client"\s*output\s*=\s*"\.\.\/lib\/generated\/prisma"\s*\}/);
});
