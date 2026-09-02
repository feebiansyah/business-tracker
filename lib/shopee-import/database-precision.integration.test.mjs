import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.ts";

const prisma = new PrismaClient();

class RollbackFixture extends Error {}

test("database round-trips five-decimal Shopee commissions exactly", async () => {
  const metaAccount = await prisma.metaAccount.findFirst({ select: { id: true } });
  assert.ok(metaAccount, "precision fixture requires one existing Meta account");

  await assert.rejects(
    prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.create({
        data: {
          metaCampaignId: `precision-${randomUUID()}`,
          name: "Shopee commission precision rollback fixture",
          budgetSource: "UNRESOLVED",
          metaAccountId: metaAccount.id,
        },
      });

      await tx.campaignDailyMetric.createMany({
        data: [
          { campaignId: campaign.id, date: new Date("2026-09-01T00:00:00.000Z"), commission: "22985.94997" },
          { campaignId: campaign.id, date: new Date("2026-09-02T00:00:00.000Z"), commission: "839.99997" },
          { campaignId: campaign.id, date: new Date("2026-09-03T00:00:00.000Z"), commission: "0.00003" },
        ],
      });

      const metrics = await tx.campaignDailyMetric.findMany({
        where: { campaignId: campaign.id },
        orderBy: { date: "asc" },
        select: { commission: true },
      });
      assert.deepEqual(
        metrics.map((metric) => metric.commission?.toFixed(5)),
        ["22985.94997", "839.99997", "0.00003"],
      );

      throw new RollbackFixture("rollback precision fixture");
    }),
    RollbackFixture,
  );
});

test.after(async () => {
  await prisma.$disconnect();
});
