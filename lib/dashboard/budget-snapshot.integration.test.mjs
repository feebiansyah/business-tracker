import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.ts";
import { upsertCampaignDailyBudgetSnapshot } from "./budget-snapshots.ts";

const prisma = new PrismaClient();
class Rollback extends Error {}

test("daily budget snapshots upsert the same local date without overwriting another date", async () => {
  const metaAccount = await prisma.metaAccount.findFirst({ select: { id: true } });
  assert.ok(metaAccount);
  await assert.rejects(prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.create({ data: { metaCampaignId: `snapshot-${randomUUID()}`, name: "Snapshot fixture", budgetSource: "CAMPAIGN_DAILY", metaAccountId: metaAccount.id } });
    await upsertCampaignDailyBudgetSnapshot(tx, campaign.id, "2026-09-04", 200000);
    await upsertCampaignDailyBudgetSnapshot(tx, campaign.id, "2026-09-04", 250000);
    await upsertCampaignDailyBudgetSnapshot(tx, campaign.id, "2026-09-05", 300000);
    const rows = await tx.campaignDailyBudgetSnapshot.findMany({ where: { campaignId: campaign.id }, orderBy: { date: "asc" } });
    assert.deepEqual(rows.map((row) => [row.date.toISOString().slice(0, 10), row.dailyBudget.toFixed(2)]), [["2026-09-04", "250000.00"], ["2026-09-05", "300000.00"]]);
    throw new Rollback();
  }), Rollback);
});

test.after(async () => prisma.$disconnect());
