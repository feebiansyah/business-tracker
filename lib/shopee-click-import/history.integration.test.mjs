import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.ts";
import { getShopeeClickHistory } from "./history.ts";

const prisma = new PrismaClient();
class Rollback extends Error {}
test("click import history is account scoped and newest first", async () => {
  const accounts = await prisma.shopeeAccount.findMany({ take: 2, select: { id: true } }); assert.equal(accounts.length, 2);
  await assert.rejects(prisma.$transaction(async (tx) => {
    const marker = randomUUID();
    const base = { originalFilename: `${marker}-old.csv`, fileSha256: "c".repeat(64), dateFrom: new Date("2026-09-01Z"), dateTo: new Date("2026-09-02Z"), csvRowCount: 3, processedRowCount: 2, ignoredRowCount: 1, groupCount: 2, matchedCount: 1, unmatchedCount: 1, matchedClicks: 1, unmatchedClicks: 1 };
    await tx.shopeeClickImport.create({ data: { ...base, shopeeAccountId: accounts[0].id, createdAt: new Date("2026-09-01Z") } });
    await tx.shopeeClickImport.create({ data: { ...base, originalFilename: `${marker}-new.csv`, shopeeAccountId: accounts[0].id, createdAt: new Date("2026-09-02Z") } });
    await tx.shopeeClickImport.create({ data: { ...base, originalFilename: `${marker}-other.csv`, shopeeAccountId: accounts[1].id } });
    const result = await getShopeeClickHistory(tx, accounts[0].id);
    const fixtureRows = result.rows.filter((row) => row.originalFilename.startsWith(marker));
    assert.deepEqual(fixtureRows.map((row) => row.originalFilename), [`${marker}-new.csv`, `${marker}-old.csv`]);
    assert.equal(result.rows.some((row) => row.originalFilename === `${marker}-other.csv`), false);
    throw new Rollback();
  }), Rollback);
});
test.after(async () => prisma.$disconnect());
