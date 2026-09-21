import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import "dotenv/config";
import Decimal from "decimal.js";

import { PrismaClient } from "../generated/prisma/client.ts";
import { loadShopeeCampaignCandidates } from "./campaign-repository.ts";
import { importShopeeCommissions } from "./importer.ts";
import { lockShopeeAccount, persistCommissionImportInTransaction } from "./persistence.ts";
import { buildShopeeCommissionPreview } from "./preview.ts";

const prisma = new PrismaClient();
class Rollback extends Error {}

test("ADU import replaces daily commission while preserving Clickadu spend and budget", async () => {
  const account = await prisma.shopeeAccount.findFirst({
    where: { metaAccounts: { some: {} } },
    select: { id: true, metaAccounts: { take: 1, select: { id: true } } },
  });
  assert.ok(account);
  await assert.rejects(prisma.$transaction(async (tx) => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
    const sourceTag = `ADU${suffix}`;
    const campaign = await tx.campaign.create({ data: {
      metaCampaignId: `adu-import-${randomUUID()}`,
      name: `META-${suffix}`,
      budgetSource: "UNRESOLVED",
      metaAccountId: account.metaAccounts[0].id,
    } });
    const config = await tx.clickaduCampaignConfig.create({ data: {
      shopeeAccountId: account.id,
      campaignId: `clickadu-${suffix}`,
      sourceTag,
    } });
    await tx.clickaduCampaignDailyMetric.create({ data: {
      clickaduCampaignConfigId: config.id,
      date: new Date("2026-09-18T00:00:00.000Z"),
      spendUsd: "2.500000",
      dailyBudget: "20.000000",
    } });
    const csv = new TextEncoder().encode(
      `Waktu Pemesanan,Tag_link1,Tag_link2,Tag_link3,Komisi Bersih Affiliate (Rp)\n` +
      `2026-09-18 10:00:00,${sourceTag},${campaign.name},101,100.12500\n` +
      `2026-09-18 11:00:00,${sourceTag.toLowerCase()},${campaign.name},102,200.37500\n` +
      `2026-09-19 10:00:00,${sourceTag},${campaign.name},101,50.00000\n` +
      `2026-09-18 12:00:00,UNKNOWN,${campaign.name},999,900.00000`,
    );
    const candidates = await loadShopeeCampaignCandidates(tx, account.id);
    const preview = await buildShopeeCommissionPreview(
      { shopeeAccountId: account.id, originalFilename: "adu.csv", bytes: csv },
      { accountExists: async () => true, loadCampaigns: async () => candidates },
    );
    const deps = {
      withTransaction: async (work) => work(tx),
      lockAccount: lockShopeeAccount,
      loadCampaigns: loadShopeeCampaignCandidates,
      loadClickaduConfigs: (db, id) => db.clickaduCampaignConfig.findMany({ where: { shopeeAccountId: id }, select: { id: true, sourceTag: true } }),
      persist: persistCommissionImportInTransaction,
    };
    await importShopeeCommissions({ shopeeAccountId: account.id, originalFilename: "adu.csv", bytes: csv, confirmation: preview.confirmation }, deps);
    await importShopeeCommissions({ shopeeAccountId: account.id, originalFilename: "adu.csv", bytes: csv, confirmation: preview.confirmation }, deps);

    const first = await tx.clickaduCampaignDailyMetric.findUniqueOrThrow({
      where: { clickaduCampaignConfigId_date: { clickaduCampaignConfigId: config.id, date: new Date("2026-09-18T00:00:00.000Z") } },
    });
    assert.equal(first.commissionIdr?.toFixed(5), "300.50000");
    assert.equal(first.spendUsd?.toFixed(6), "2.500000");
    assert.equal(first.dailyBudget?.toFixed(6), "20.000000");

    const commissionOnly = await tx.clickaduCampaignDailyMetric.findUniqueOrThrow({
      where: { clickaduCampaignConfigId_date: { clickaduCampaignConfigId: config.id, date: new Date("2026-09-19T00:00:00.000Z") } },
    });
    assert.equal(commissionOnly.commissionIdr?.toFixed(5), "50.00000");
    assert.equal(commissionOnly.spendUsd, null);
    assert.equal(commissionOnly.dailyBudget, null);
    throw new Rollback();
  }, { timeout: 30_000 }), Rollback);
});

test("ADU persistence failure rolls back Meta commission and import history", async () => {
  const account = await prisma.shopeeAccount.findFirst({
    where: { metaAccounts: { some: {} } },
    select: { id: true, metaAccounts: { take: 1, select: { id: true } } },
  });
  assert.ok(account);
  const suffix = randomUUID();
  const campaign = await prisma.campaign.create({ data: {
    metaCampaignId: `adu-rollback-${suffix}`,
    name: `ADU-ROLLBACK-${suffix}`,
    budgetSource: "UNRESOLVED",
    metaAccountId: account.metaAccounts[0].id,
  } });
  const date = new Date("2026-09-17T00:00:00.000Z");
  await prisma.campaignDailyMetric.create({ data: { campaignId: campaign.id, date, commission: "10.00000" } });
  const fileSha256 = randomUUID().replaceAll("-", "").padEnd(64, "0").slice(0, 64);
  try {
    await assert.rejects(prisma.$transaction((tx) => persistCommissionImportInTransaction(tx, {
      shopeeAccountId: account.id,
      originalFilename: "adu-failure.csv",
      fileSha256,
      dateFrom: "2026-09-17",
      dateTo: "2026-09-17",
      csvRowCount: 1,
      tagCount: 1,
      matched: [{ campaignId: campaign.id, date: "2026-09-17", tagLink2: campaign.name, normalizedTagLink2: campaign.name, commission: new Decimal("99"), rowCount: 1 }],
      unmatched: [],
      matchedCommission: new Decimal("99"),
      unmatchedCommission: new Decimal(0),
      clickaduCommissions: [{ clickaduCampaignConfigId: 2_147_483_647, date: "2026-09-17", commission: new Decimal("50"), rowCount: 1 }],
    })));
    const metric = await prisma.campaignDailyMetric.findUniqueOrThrow({ where: { campaignId_date: { campaignId: campaign.id, date } } });
    assert.equal(metric.commission?.toFixed(5), "10.00000");
    assert.equal(await prisma.shopeeCommissionImport.count({ where: { fileSha256 } }), 0);
  } finally {
    await prisma.campaignDailyMetric.deleteMany({ where: { campaignId: campaign.id } });
    await prisma.campaign.delete({ where: { id: campaign.id } });
  }
});

test.after(async () => prisma.$disconnect());
