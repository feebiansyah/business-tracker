import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.ts";
import { getDashboardData } from "./queries.ts";

const prisma = new PrismaClient();
class Rollback extends Error {}
const at = (date) => new Date(`${date}T00:00:00.000Z`);

test("dashboard isolates Shopee accounts and aggregates, filters, sorts, and paginates in the database", async () => {
  await assert.rejects(prisma.$transaction(async (tx) => {
    const suffix = randomUUID();
    const [shopeeA, shopeeB] = await Promise.all([
      tx.shopeeAccount.create({ data: { name: `Dashboard A ${suffix}` } }),
      tx.shopeeAccount.create({ data: { name: `Dashboard B ${suffix}` } }),
    ]);
    const [wlA, wlB] = await Promise.all([
      tx.metaAccount.create({ data: { name: "WL A", accountId: `dashboard-wl-a-${suffix}`, shopeeAccountId: shopeeA.id } }),
      tx.metaAccount.create({ data: { name: "WL B", accountId: `dashboard-wl-b-${suffix}`, shopeeAccountId: shopeeB.id } }),
    ]);
    const [campaignA, campaignB] = await Promise.all([
      tx.campaign.create({ data: { name: "Campaign A", metaCampaignId: `dashboard-c-a-${suffix}`, metaAccountId: wlA.id, budgetSource: "CAMPAIGN_DAILY" } }),
      tx.campaign.create({ data: { name: "Campaign B", metaCampaignId: `dashboard-c-b-${suffix}`, metaAccountId: wlB.id, budgetSource: "CAMPAIGN_DAILY" } }),
    ]);
    const dates = Array.from({ length: 26 }, (_, index) => `2026-08-${String(index + 1).padStart(2, "0")}`);
    await tx.campaignDailyBudgetSnapshot.createMany({ data: dates.map((date, index) => ({ campaignId: campaignA.id, date: at(date), dailyBudget: index === 9 ? 100 : 10 })) });
    await tx.campaignDailyBudgetSnapshot.create({ data: { campaignId: campaignB.id, date: at("2026-08-10"), dailyBudget: 999 } });
    await Promise.all([
      tx.campaignDailyMetric.create({ data: { campaignId: campaignA.id, date: at("2026-08-10"), commission: 200 } }),
      tx.campaignDailyMetric.create({ data: { campaignId: campaignB.id, date: at("2026-08-10"), commission: 500 } }),
    ]);
    const history = { originalFilename: "dashboard.csv", fileSha256: "d".repeat(64), dateFrom: at("2026-08-01"), dateTo: at("2026-08-09"), csvRowCount: 1, tagCount: 1, matchedCount: 1, unmatchedCount: 0, matchedCommission: 200, unmatchedCommission: 0 };
    await Promise.all([tx.shopeeCommissionImport.create({ data: { ...history, shopeeAccountId: shopeeA.id } }), tx.shopeeCommissionImport.create({ data: { ...history, shopeeAccountId: shopeeB.id, dateTo: at("2026-08-10") } })]);

    const data = await getDashboardData({ [`page_${shopeeA.id}`]: "2", [`pageSize_${shopeeA.id}`]: "25" }, tx);
    const accountA = data.accounts.find((account) => account.id === shopeeA.id);
    const accountB = data.accounts.find((account) => account.id === shopeeB.id);
    assert.equal(accountA.wlCount, 1);
    assert.equal(accountA.pagination.total, 26);
    assert.equal(accountA.days.length, 1);
    assert.equal(accountA.summary.budget, 350);
    assert.equal(accountA.summary.commission, null);
    assert.equal(accountB.days[0].budget, 999);
    assert.equal(accountB.days[0].commission, 500);

    const ranged = await getDashboardData({ from: "2026-08-10", to: "2026-08-10" }, tx);
    const rangedA = ranged.accounts.find((account) => account.id === shopeeA.id);
    assert.equal(rangedA.days.length, 1);
    assert.equal(rangedA.days[0].commission, 200);
    assert.equal(rangedA.summary.profit, 95);
    throw new Rollback();
  }, { timeout: 30000 }), Rollback);
});

test.after(async () => prisma.$disconnect());
