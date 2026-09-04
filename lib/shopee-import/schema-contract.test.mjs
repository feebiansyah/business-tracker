import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Prisma } from "../generated/prisma/client.ts";

const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");

function modelFieldDefinition(modelName, fieldName) {
  const model = schema.match(new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`))?.[1];
  assert.ok(model, `Model ${modelName} must exist`);
  const field = model.split(/\r?\n/).find((line) => line.trimStart().startsWith(`${fieldName} `));
  assert.ok(field, `${modelName}.${fieldName} must exist`);
  return field;
}

test("generated schema exposes additive Shopee import history models", () => {
  assert.equal(Prisma.ModelName.ShopeeCommissionImport, "ShopeeCommissionImport");
  assert.equal(Prisma.ModelName.ShopeeCommissionImportUnmatched, "ShopeeCommissionImportUnmatched");
  assert.deepEqual(
    ["shopeeAccountId", "fileSha256", "matchedCommission", "unmatchedCommission"].filter((field) => Object.hasOwn(Prisma.ShopeeCommissionImportScalarFieldEnum, field)).sort(),
    ["fileSha256", "matchedCommission", "shopeeAccountId", "unmatchedCommission"],
  );
  assert.equal(Prisma.ShopeeCommissionImportUnmatchedScalarFieldEnum.reason, "reason");
});

test("generated schema exposes exact campaign-date commission coverage", () => {
  assert.equal(Prisma.ModelName.ShopeeCommissionCoverage, "ShopeeCommissionCoverage");
  assert.equal(Prisma.ShopeeCommissionCoverageScalarFieldEnum.campaignId, "campaignId");
  assert.equal(Prisma.ShopeeCommissionCoverageScalarFieldEnum.date, "date");
});

test("generated schema exposes daily campaign budget snapshots", () => {
  assert.equal(Prisma.ModelName.CampaignDailyBudgetSnapshot, "CampaignDailyBudgetSnapshot");
  assert.equal(Prisma.CampaignDailyBudgetSnapshotScalarFieldEnum.campaignId, "campaignId");
  assert.equal(Prisma.CampaignDailyBudgetSnapshotScalarFieldEnum.dailyBudget, "dailyBudget");
});

test("all Shopee commission persistence fields retain 16 integer and 5 fractional digits", () => {
  for (const [modelName, fieldName] of [
    ["CampaignDailyMetric", "commission"],
    ["ShopeeCommissionImport", "matchedCommission"],
    ["ShopeeCommissionImport", "unmatchedCommission"],
    ["ShopeeCommissionImportUnmatched", "commission"],
  ]) {
    assert.match(modelFieldDefinition(modelName, fieldName), /@db\.Decimal\(21, 5\)/);
  }
});
