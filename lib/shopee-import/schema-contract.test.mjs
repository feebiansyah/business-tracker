import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "../generated/prisma/client.ts";

test("generated schema exposes additive Shopee import history models", () => {
  assert.equal(Prisma.ModelName.ShopeeCommissionImport, "ShopeeCommissionImport");
  assert.equal(Prisma.ModelName.ShopeeCommissionImportUnmatched, "ShopeeCommissionImportUnmatched");
  assert.deepEqual(
    ["shopeeAccountId", "fileSha256", "matchedCommission", "unmatchedCommission"].filter((field) => Object.hasOwn(Prisma.ShopeeCommissionImportScalarFieldEnum, field)).sort(),
    ["fileSha256", "matchedCommission", "shopeeAccountId", "unmatchedCommission"],
  );
  assert.equal(Prisma.ShopeeCommissionImportUnmatchedScalarFieldEnum.reason, "reason");
});
