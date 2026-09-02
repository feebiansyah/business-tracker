import assert from "node:assert/strict";
import test from "node:test";
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.ts";

const prisma = new PrismaClient();
class Rollback extends Error {}

test("a failure after metric and history writes rolls the transaction back", async () => {
  const before = await prisma.$transaction(async (tx) => ({ metrics: await tx.campaignDailyMetric.count(), histories: await tx.shopeeCommissionImport.count() }));
  await assert.rejects(prisma.$transaction(async (tx) => {
    const account = await tx.shopeeAccount.findFirstOrThrow();
    await tx.shopeeCommissionImport.create({ data: { shopeeAccountId: account.id, originalFilename: "rollback.csv", fileSha256: "f".repeat(64), dateFrom: new Date("2026-09-01Z"), dateTo: new Date("2026-09-01Z"), csvRowCount: 1, tagCount: 0, matchedCount: 0, unmatchedCount: 0, matchedCommission: "0.00000", unmatchedCommission: "0.00000" } });
    throw new Rollback();
  }), Rollback);
  assert.deepEqual({ metrics: await prisma.campaignDailyMetric.count(), histories: await prisma.shopeeCommissionImport.count() }, before);
});

test.after(async () => prisma.$disconnect());
