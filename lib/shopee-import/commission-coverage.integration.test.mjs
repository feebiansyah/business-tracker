import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import "dotenv/config";
import Decimal from "decimal.js";
import { PrismaClient } from "../generated/prisma/client.ts";
import { createCommissionCoverageLookup, hasCommissionCoverage } from "../filter/commission-coverage.ts";
import { persistCommissionImportInTransaction } from "./persistence.ts";

const prisma = new PrismaClient();
class RollbackFixture extends Error {}

function matched(campaignId, tagLink2, commission = "0.00000") {
  return { campaignId, date: "2026-08-10", tagLink2, normalizedTagLink2: tagLink2, commission: new Decimal(commission), rowCount: 1 };
}

function input(shopeeAccountId, filename, matchedRows) {
  const matchedCommission = matchedRows.reduce((sum, row) => sum.plus(row.commission), new Decimal(0));
  return { shopeeAccountId, originalFilename: filename, fileSha256: "a".repeat(64), dateFrom: "2026-08-10", dateTo: "2026-08-10", csvRowCount: matchedRows.length, tagCount: matchedRows.length, matched: matchedRows, unmatched: [], matchedCommission, unmatchedCommission: new Decimal(0) };
}

test("coverage stays exact across separate CSV sources in one Shopee account", async () => {
  const account = await prisma.shopeeAccount.findFirst({ where: { metaAccounts: { some: {} } }, select: { id: true, metaAccounts: { take: 1, select: { id: true } } } });
  assert.ok(account);

  await assert.rejects(prisma.$transaction(async (tx) => {
    const campaignA = await tx.campaign.create({ data: { metaCampaignId: `coverage-a-${randomUUID()}`, name: "CSV-A-CAMPAIGN", budgetSource: "UNRESOLVED", metaAccountId: account.metaAccounts[0].id } });
    const campaignB = await tx.campaign.create({ data: { metaCampaignId: `coverage-b-${randomUUID()}`, name: "CSV-B-CAMPAIGN", budgetSource: "UNRESOLVED", metaAccountId: account.metaAccounts[0].id } });

    await persistCommissionImportInTransaction(tx, input(account.id, "csv-a.csv", [matched(campaignA.id, "CSV-A-CAMPAIGN")]));
    let rows = await tx.shopeeCommissionCoverage.findMany({ select: { campaignId: true, date: true } });
    let lookup = createCommissionCoverageLookup(rows.map((row) => ({ campaignId: row.campaignId, date: row.date.toISOString().slice(0, 10) })));
    assert.equal(hasCommissionCoverage(lookup, campaignA.id, "2026-08-10"), true);
    assert.equal(hasCommissionCoverage(lookup, campaignB.id, "2026-08-10"), false);

    await persistCommissionImportInTransaction(tx, input(account.id, "csv-b.csv", [matched(campaignB.id, "CSV-B-CAMPAIGN")]));
    await persistCommissionImportInTransaction(tx, input(account.id, "csv-a-again.csv", [matched(campaignA.id, "CSV-A-CAMPAIGN")]));
    rows = await tx.shopeeCommissionCoverage.findMany({ where: { campaignId: { in: [campaignA.id, campaignB.id] } }, select: { campaignId: true, date: true } });
    lookup = createCommissionCoverageLookup(rows.map((row) => ({ campaignId: row.campaignId, date: row.date.toISOString().slice(0, 10) })));
    assert.equal(hasCommissionCoverage(lookup, campaignB.id, "2026-08-10"), true);
    assert.equal(rows.length, 2);

    throw new RollbackFixture();
  }), RollbackFixture);
});

test.after(async () => prisma.$disconnect());
