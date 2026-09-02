import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.ts";
import { persistClickImportInTransaction } from "./persistence.ts";

const prisma = new PrismaClient();
class Rollback extends Error {}

test("re-import replaces clicks while preserving commission, Meta, note, and completion", async () => {
  const account = await prisma.shopeeAccount.findFirst({ where: { metaAccounts: { some: {} } }, select: { id: true, metaAccounts: { take: 1, select: { id: true } } } });
  assert.ok(account);
  await assert.rejects(prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.create({ data: { metaCampaignId: `click-${randomUUID()}`, name: "CLICK-A", budgetSource: "UNRESOLVED", metaAccountId: account.metaAccounts[0].id } });
    await tx.campaignDailyMetric.create({ data: { campaignId: campaign.id, date: new Date("2026-09-01Z"), shopeeClicks: 4, commission: "9.12345", spend: "12.34", clickFp: 5, cpcFp: "2.4680", note: "keep", completed: true } });
    const base = { rows: [], csvRowCount: 2, processedRowCount: 2, ignoredRowCount: 0, aggregates: [], groupCount: 1, dateFrom: "2026-09-01", dateTo: "2026-09-01", unmatched: [], unmatchedClicks: 0, shopeeAccountId: account.id, originalFilename: "click.csv", fileSha256: "a".repeat(64) };
    await persistClickImportInTransaction(tx, { ...base, matched: [{ campaignId: campaign.id, date: "2026-09-01", tagLink2: "CLICK-A", normalizedTagLink2: "CLICK-A", clickCount: 7 }], matchedClicks: 7 });
    await persistClickImportInTransaction(tx, { ...base, matched: [{ campaignId: campaign.id, date: "2026-09-01", tagLink2: "CLICK-A", normalizedTagLink2: "CLICK-A", clickCount: 3 }], matchedClicks: 3 });
    const metric = await tx.campaignDailyMetric.findFirstOrThrow({ where: { campaignId: campaign.id } });
    assert.equal(metric.shopeeClicks, 3);
    assert.equal(metric.commission?.toFixed(5), "9.12345"); assert.equal(metric.spend?.toFixed(2), "12.34"); assert.equal(metric.clickFp, 5); assert.equal(metric.cpcFp?.toFixed(4), "2.4680"); assert.equal(metric.note, "keep"); assert.equal(metric.completed, true);
    assert.equal(await tx.shopeeClickImport.count({ where: { fileSha256: base.fileSha256 } }), 2);
    throw new Rollback();
  }), Rollback);
});

test("history, unmatched, and metrics roll back together on failure", async () => {
  const before = await prisma.shopeeClickImport.count();
  await assert.rejects(prisma.$transaction(async (tx) => { const account = await tx.shopeeAccount.findFirstOrThrow(); await tx.shopeeClickImport.create({ data: { shopeeAccountId: account.id, originalFilename: "rollback.csv", fileSha256: "b".repeat(64), dateFrom: new Date("2026-09-01Z"), dateTo: new Date("2026-09-01Z"), csvRowCount: 1, processedRowCount: 0, ignoredRowCount: 1, groupCount: 0, matchedCount: 0, unmatchedCount: 0, matchedClicks: 0, unmatchedClicks: 0 } }); throw new Error("injected"); }), /injected/);
  assert.equal(await prisma.shopeeClickImport.count(), before);
});

test.after(async () => prisma.$disconnect());
