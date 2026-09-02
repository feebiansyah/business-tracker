import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import "dotenv/config";
import { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import { loadShopeeCampaignCandidates } from "../shopee-import/campaign-repository.ts";
import { lockShopeeAccount } from "../shopee-import/persistence.ts";
import { buildShopeeClickPreview } from "./preview.ts";
import { importShopeeClicks } from "./importer.ts";
import { persistClickImportInTransaction } from "./persistence.ts";

const prisma = new PrismaClient(); class Rollback extends Error {}
const bytes = new TextEncoder().encode("Klik ID,Waktu Klik,Wilayah Klik,Tag_link,Perujuk\n1,2026-09-01 10:00:00,ID,META-CLICKA---,x\n2,2026-09-01 11:00:00,ID,META-MISSING---,x\n3,2026-09-01 12:00:00,ID,ORGANIC-X---,x\n4,2026-09-01 13:00:00,ID,META----,x");

test("final click import writes matched and unmatched, ignores invalid scope rows, and rolls back", async () => {
  const account = await prisma.shopeeAccount.findFirst({ where: { metaAccounts: { some: {} } }, select: { id: true, metaAccounts: { take: 1, select: { id: true } } } }); assert.ok(account);
  await assert.rejects(prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.create({ data: { metaCampaignId: `click-e2e-${randomUUID()}`, name: "CLICKA", budgetSource: "UNRESOLVED", metaAccountId: account.metaAccounts[0].id } });
    const candidates = await loadShopeeCampaignCandidates(tx, account.id);
    const preview = await buildShopeeClickPreview({ shopeeAccountId: account.id, originalFilename: "../click.csv", bytes }, { accountExists: async () => true, loadCampaigns: async () => candidates });
    const receipt = await importShopeeClicks({ shopeeAccountId: account.id, originalFilename: "../click.csv", bytes, confirmation: preview.confirmation }, { withTransaction: async (work) => work(tx), lockAccount: lockShopeeAccount, loadCampaigns: loadShopeeCampaignCandidates, persist: persistClickImportInTransaction });
    assert.equal(receipt.matchedClicks, 1); assert.equal(receipt.unmatchedClicks, 1);
    const metric = await tx.campaignDailyMetric.findUniqueOrThrow({ where: { campaignId_date: { campaignId: campaign.id, date: new Date("2026-09-01Z") } } });
    assert.equal(metric.shopeeClicks, 1); assert.equal(metric.commission, null); assert.equal(metric.spend, null); assert.equal(metric.note, null); assert.equal(metric.completed, false);
    const history = await tx.shopeeClickImport.findUniqueOrThrow({ where: { id: receipt.importId }, include: { unmatched: true } });
    assert.equal(history.processedRowCount, 2); assert.equal(history.ignoredRowCount, 2); assert.equal(history.unmatched.length, 1); assert.equal(history.unmatched[0].tagLink2, "MISSING");
    throw new Rollback();
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30000 }), Rollback);
});
test.after(async () => prisma.$disconnect());
