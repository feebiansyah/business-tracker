import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import "dotenv/config";
import Decimal from "decimal.js";
import { PrismaClient } from "../generated/prisma/client.ts";
import { upsertCommissionChunks } from "./persistence.ts";

const prisma = new PrismaClient();

class RollbackFixture extends Error {}

function matched(campaignId, date, commission) {
  return {
    campaignId,
    date,
    tagLink2: `CAMPAIGN-${campaignId}`,
    normalizedTagLink2: `CAMPAIGN-${campaignId}`,
    commission: new Decimal(commission),
    rowCount: 1,
  };
}

test("bulk persistence replaces commission while preserving Meta, manual, and absent metrics", async () => {
  const metaAccount = await prisma.metaAccount.findFirst({ select: { id: true } });
  assert.ok(metaAccount, "persistence fixture requires one existing Meta account");

  await assert.rejects(
    prisma.$transaction(async (tx) => {
      const [campaignA, campaignB] = await Promise.all([
        tx.campaign.create({
          data: {
            metaCampaignId: `persistence-a-${randomUUID()}`,
            name: "Persistence A rollback fixture",
            budgetSource: "UNRESOLVED",
            metaAccountId: metaAccount.id,
          },
        }),
        tx.campaign.create({
          data: {
            metaCampaignId: `persistence-b-${randomUUID()}`,
            name: "Persistence B rollback fixture",
            budgetSource: "UNRESOLVED",
            metaAccountId: metaAccount.id,
          },
        }),
      ]);

      const existing = await tx.campaignDailyMetric.create({
        data: {
          campaignId: campaignA.id,
          date: new Date("2026-09-01T00:00:00.000Z"),
          spend: "321.45",
          clickFp: 17,
          cpcFp: "18.9088",
          commission: "100.00000",
          shopeeClicks: 9,
          note: "keep this note",
          completed: true,
        },
      });
      const absent = await tx.campaignDailyMetric.create({
        data: {
          campaignId: campaignA.id,
          date: new Date("2026-09-09T00:00:00.000Z"),
          spend: "88.00",
          commission: "77.77777",
          note: "not in import",
        },
      });

      await upsertCommissionChunks(tx, [
        matched(campaignA.id, "2026-09-01", "150.12345"),
        matched(campaignA.id, "2026-09-02", "22985.94997"),
        matched(campaignA.id, "2026-09-03", "0.00003"),
        matched(campaignB.id, "2026-09-01", "839.99997"),
      ]);

      const updated = await tx.campaignDailyMetric.findUniqueOrThrow({ where: { id: existing.id } });
      assert.equal(updated.commission?.toFixed(5), "150.12345");
      assert.equal(updated.spend?.toFixed(2), "321.45");
      assert.equal(updated.clickFp, 17);
      assert.equal(updated.cpcFp?.toFixed(4), "18.9088");
      assert.equal(updated.shopeeClicks, 9);
      assert.equal(updated.note, "keep this note");
      assert.equal(updated.completed, true);

      const untouched = await tx.campaignDailyMetric.findUniqueOrThrow({ where: { id: absent.id } });
      assert.equal(untouched.commission?.toFixed(5), "77.77777");
      assert.equal(untouched.spend?.toFixed(2), "88.00");
      assert.equal(untouched.note, "not in import");

      const inserted = await tx.campaignDailyMetric.findMany({
        where: {
          OR: [
            { campaignId: campaignA.id, date: { in: [new Date("2026-09-02T00:00:00.000Z"), new Date("2026-09-03T00:00:00.000Z")] } },
            { campaignId: campaignB.id, date: new Date("2026-09-01T00:00:00.000Z") },
          ],
        },
        orderBy: [{ campaignId: "asc" }, { date: "asc" }],
      });
      assert.deepEqual(inserted.map((row) => row.commission?.toFixed(5)), ["22985.94997", "0.00003", "839.99997"]);
      for (const row of inserted) {
        assert.equal(row.spend, null);
        assert.equal(row.clickFp, null);
        assert.equal(row.cpcFp, null);
        assert.equal(row.shopeeClicks, null);
        assert.equal(row.note, null);
        assert.equal(row.completed, false);
      }

      assert.equal(await tx.campaignDailyMetric.count({ where: { campaignId: { in: [campaignA.id, campaignB.id] } } }), 5);
      throw new RollbackFixture("rollback persistence fixture");
    }),
    RollbackFixture,
  );
});

test.after(async () => {
  await prisma.$disconnect();
});
