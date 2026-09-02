import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "../generated/prisma/client.ts";

test("generated schema exposes separate Shopee click import history models", () => {
  assert.deepEqual(
    ["shopeeAccountId", "fileSha256", "processedRowCount", "ignoredRowCount", "matchedClicks", "unmatchedClicks"]
      .filter((field) => Object.hasOwn(Prisma.ShopeeClickImportScalarFieldEnum ?? {}, field))
      .sort(),
    ["fileSha256", "ignoredRowCount", "matchedClicks", "processedRowCount", "shopeeAccountId", "unmatchedClicks"],
  );
  assert.ok(Prisma.ShopeeClickImportUnmatchedScalarFieldEnum);
});
