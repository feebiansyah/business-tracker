import assert from "node:assert/strict";
import test from "node:test";
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.ts";
import { getShopeeImportPageData } from "./history.ts";

const prisma = new PrismaClient();
class Rollback extends Error {}

test("history is account scoped, newest first, and preserves exact decimals", async () => {
  const accounts = await prisma.shopeeAccount.findMany({ take: 2, orderBy: { id: "asc" } });
  assert.equal(accounts.length, 2);
  await assert.rejects(prisma.$transaction(async (tx) => {
    const base = { originalFilename: "report.csv", fileSha256: "a".repeat(64), dateFrom: new Date("2026-09-01Z"), dateTo: new Date("2026-09-02Z"), csvRowCount: 3, tagCount: 2, matchedCount: 1, unmatchedCount: 1, matchedCommission: "22985.94997", unmatchedCommission: "0.00003" };
    await tx.shopeeCommissionImport.create({ data: { ...base, shopeeAccountId: accounts[0].id, createdAt: new Date("2026-09-01T01:00:00Z") } });
    await tx.shopeeCommissionImport.create({ data: { ...base, originalFilename: "new.csv", shopeeAccountId: accounts[0].id, createdAt: new Date("2026-09-02T01:00:00Z") } });
    await tx.shopeeCommissionImport.create({ data: { ...base, originalFilename: "other.csv", shopeeAccountId: accounts[1].id } });
    const result = await getShopeeImportPageData(tx, accounts[0].id);
    assert.equal(result.shopeeAccount.id, accounts[0].id);
    assert.deepEqual(result.history.map((row) => row.originalFilename), ["new.csv", "report.csv"]);
    assert.equal(result.history[0].matchedCommission, "22985.94997");
    assert.equal(result.history[0].unmatchedCommission, "0.00003");
    assert.equal(result.history.some((row) => row.originalFilename === "other.csv"), false);
    assert.equal(await getShopeeImportPageData(tx, 999999999), null);
    throw new Rollback();
  }), Rollback);
});

test.after(async () => prisma.$disconnect());
