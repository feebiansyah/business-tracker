import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import "dotenv/config";

import { PrismaClient } from "../generated/prisma/client.ts";
import { loadShopeeCampaignCandidates } from "./campaign-repository.ts";
import { importShopeeCommissions } from "./importer.ts";
import { lockShopeeAccount, persistCommissionImportInTransaction } from "./persistence.ts";
import { buildShopeeCommissionPreview } from "./preview.ts";

const prisma = new PrismaClient();
class Rollback extends Error {}

function csv(sourceTag, tagLink2 = "") {
  return new TextEncoder().encode(
    `Waktu Pemesanan,Tag_link1,Tag_link2,Tag_link3,Komisi Bersih Affiliate (Rp)\n` +
      `2026-09-18 10:00:00,${sourceTag},${tagLink2},101,100000`,
  );
}

async function preview(tx, accountId, bytes) {
  return buildShopeeCommissionPreview(
    { shopeeAccountId: accountId, originalFilename: "traffic-only.csv", bytes },
    {
      accountExists: async () => true,
      loadCampaigns: (id) => loadShopeeCampaignCandidates(tx, id),
    },
  );
}

function dependencies(tx) {
  return {
    withTransaction: async (work) => work(tx),
    lockAccount: lockShopeeAccount,
    loadCampaigns: loadShopeeCampaignCandidates,
    loadClickaduConfigs: (db, id) =>
      db.clickaduCampaignConfig.findMany({
        where: { shopeeAccountId: id },
        select: { id: true, sourceTag: true },
      }),
    loadAdsterraConfigs: (db, id) =>
      db.adsterraCampaignConfig.findMany({
        where: { shopeeAccountId: id },
        select: { id: true, sourceTag: true },
      }),
    persist: persistCommissionImportInTransaction,
  };
}

async function assertMetaStayedEmpty(tx, accountId) {
  assert.equal(await tx.metaAccount.count({ where: { shopeeAccountId: accountId } }), 0);
  assert.equal(await tx.campaign.count({ where: { metaAccount: { shopeeAccountId: accountId } } }), 0);
  assert.equal(
    await tx.campaignDailyMetric.count({
      where: { campaign: { metaAccount: { shopeeAccountId: accountId } } },
    }),
    0,
  );
}

test("Clickadu commission import succeeds for a Shopee account without Meta", async () => {
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      const suffix = randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
      const sourceTag = `ADU${suffix}`;
      const account = await tx.shopeeAccount.create({ data: { name: `Traffic Only ${suffix}` } });
      const config = await tx.clickaduCampaignConfig.create({
        data: { shopeeAccountId: account.id, campaignId: `clickadu-${suffix}`, sourceTag },
      });
      const bytes = csv(sourceTag);
      const result = await preview(tx, account.id, bytes);

      assert.equal(result.dateFrom, "2026-09-18");
      assert.equal(result.dateTo, "2026-09-18");
      assert.equal(result.tagCount, 0);
      assert.equal(result.matchedCount, 0);
      assert.equal(result.unmatchedCount, 0);

      const receipt = await importShopeeCommissions(
        {
          shopeeAccountId: account.id,
          originalFilename: "clickadu-only.csv",
          bytes,
          confirmation: result.confirmation,
        },
        dependencies(tx),
      );

      assert.equal(receipt.matchedCount, 0);
      assert.equal(receipt.unmatchedCount, 0);
      const metric = await tx.clickaduCampaignDailyMetric.findUniqueOrThrow({
        where: {
          clickaduCampaignConfigId_date: {
            clickaduCampaignConfigId: config.id,
            date: new Date("2026-09-18T00:00:00.000Z"),
          },
        },
      });
      assert.equal(metric.commissionIdr?.toFixed(5), "100000.00000");
      const history = await tx.shopeeCommissionImport.findUniqueOrThrow({
        where: { id: receipt.importId },
        include: { unmatched: true },
      });
      assert.equal(history.matchedCount, 0);
      assert.equal(history.unmatchedCount, 0);
      assert.deepEqual(history.unmatched, []);
      await assertMetaStayedEmpty(tx, account.id);
      throw new Rollback();
    }),
    Rollback,
  );
});

test("Adsterra commission import succeeds for a Shopee account without Meta", async () => {
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      const suffix = randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
      const sourceTag = `TERRA${suffix}`;
      const account = await tx.shopeeAccount.create({ data: { name: `Traffic Only ${suffix}` } });
      const config = await tx.adsterraCampaignConfig.create({
        data: { shopeeAccountId: account.id, campaignId: `adsterra-${suffix}`, sourceTag },
      });
      const bytes = csv(sourceTag);
      const result = await preview(tx, account.id, bytes);

      assert.equal(result.dateFrom, "2026-09-18");
      assert.equal(result.dateTo, "2026-09-18");
      assert.equal(result.tagCount, 0);
      assert.equal(result.matchedCount, 0);
      assert.equal(result.unmatchedCount, 0);

      const receipt = await importShopeeCommissions(
        {
          shopeeAccountId: account.id,
          originalFilename: "adsterra-only.csv",
          bytes,
          confirmation: result.confirmation,
        },
        dependencies(tx),
      );

      assert.equal(receipt.matchedCount, 0);
      assert.equal(receipt.unmatchedCount, 0);
      const metric = await tx.adsterraCampaignDailyMetric.findUniqueOrThrow({
        where: {
          adsterraCampaignConfigId_date: {
            adsterraCampaignConfigId: config.id,
            date: new Date("2026-09-18T00:00:00.000Z"),
          },
        },
      });
      assert.equal(metric.commissionIdr?.toFixed(5), "100000.00000");
      assert.equal(await tx.shopeeCommissionImport.count({ where: { id: receipt.importId } }), 1);
      await assertMetaStayedEmpty(tx, account.id);
      throw new Rollback();
    }),
    Rollback,
  );
});

test("normal Meta commission matching remains unchanged", async () => {
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      const suffix = randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
      const account = await tx.shopeeAccount.create({ data: { name: `Meta ${suffix}` } });
      const businessManager = await tx.businessManager.create({
        data: { name: `BM ${suffix}`, bmId: `bm-${suffix}` },
      });
      const metaAccount = await tx.metaAccount.create({
        data: {
          name: `WL ${suffix}`,
          accountId: `act-${suffix}`,
          businessManagerId: businessManager.id,
          shopeeAccountId: account.id,
        },
      });
      const campaign = await tx.campaign.create({
        data: {
          metaCampaignId: `meta-${suffix}`,
          name: `META-${suffix}`,
          budgetSource: "UNRESOLVED",
          metaAccountId: metaAccount.id,
        },
      });
      const bytes = csv("NON-TRAFFIC", campaign.name);
      const result = await preview(tx, account.id, bytes);
      assert.equal(result.matchedCount, 1);
      assert.equal(result.unmatchedCount, 0);

      await importShopeeCommissions(
        {
          shopeeAccountId: account.id,
          originalFilename: "meta.csv",
          bytes,
          confirmation: result.confirmation,
        },
        dependencies(tx),
      );
      const metric = await tx.campaignDailyMetric.findUniqueOrThrow({
        where: {
          campaignId_date: {
            campaignId: campaign.id,
            date: new Date("2026-09-18T00:00:00.000Z"),
          },
        },
      });
      assert.equal(metric.commission?.toFixed(5), "100000.00000");
      throw new Rollback();
    }),
    Rollback,
  );
});

test("an unmatched row without any provider match creates only import history and unmatched detail", async () => {
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      const suffix = randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
      const account = await tx.shopeeAccount.create({ data: { name: `Unmatched ${suffix}` } });
      const bytes = csv("UNKNOWN", "META-TIDAK-ADA");
      const result = await preview(tx, account.id, bytes);
      const receipt = await importShopeeCommissions(
        {
          shopeeAccountId: account.id,
          originalFilename: "unmatched.csv",
          bytes,
          confirmation: result.confirmation,
        },
        dependencies(tx),
      );

      assert.equal(receipt.matchedCount, 0);
      assert.equal(receipt.unmatchedCount, 1);
      assert.equal(
        await tx.clickaduCampaignDailyMetric.count({
          where: { clickaduCampaignConfig: { shopeeAccountId: account.id } },
        }),
        0,
      );
      assert.equal(
        await tx.adsterraCampaignDailyMetric.count({
          where: { adsterraCampaignConfig: { shopeeAccountId: account.id } },
        }),
        0,
      );
      await assertMetaStayedEmpty(tx, account.id);
      const history = await tx.shopeeCommissionImport.findUniqueOrThrow({
        where: { id: receipt.importId },
        include: { unmatched: true },
      });
      assert.equal(history.unmatched[0].reason, "CAMPAIGN_NOT_FOUND");
      throw new Rollback();
    }),
    Rollback,
  );
});

test.after(async () => prisma.$disconnect());
