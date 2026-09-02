import assert from "node:assert/strict";
import test from "node:test";
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.ts";
import { getShopeeClickHistory } from "./history.ts";

const prisma = new PrismaClient();
class Rollback extends Error {}
test("click import history is account scoped and newest first", async () => {
  const accounts = await prisma.shopeeAccount.findMany({ take: 2, select: { id: true } }); assert.equal(accounts.length, 2);
  await assert.rejects(prisma.$transaction(async (tx) => {
    const base = { originalFilename: "old.csv", fileSha256: "c".repeat(64), dateFrom: new Date("2026-09-01Z"), dateTo: new Date("2026-09-02Z"), csvRowCount: 3, processedRowCount: 2, ignoredRowCount: 1, groupCount: 2, matchedCount: 1, unmatchedCount: 1, matchedClicks: 1, unmatchedClicks: 1 };
    await tx.shopeeClickImport.create({ data: { ...base, shopeeAccountId: accounts[0].id, createdAt: new Date("2026-09-01Z") } });
    await tx.shopeeClickImport.create({ data: { ...base, originalFilename: "new.csv", shopeeAccountId: accounts[0].id, createdAt: new Date("2026-09-02Z") } });
    await tx.shopeeClickImport.create({ data: { ...base, originalFilename: "other.csv", shopeeAccountId: accounts[1].id } });
    const rows = await getShopeeClickHistory(tx, accounts[0].id);
    assert.deepEqual(rows.map((row) => row.originalFilename), ["new.csv", "old.csv"]);
    throw new Rollback();
  }), Rollback);
});
test.after(async () => prisma.$disconnect());
