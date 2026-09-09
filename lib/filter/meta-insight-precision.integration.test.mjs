import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.ts";
import { metaFieldsFromInsight } from "./metrics.ts";

const prisma = new PrismaClient();
class RollbackFixture extends Error {}

test("campaign-date upsert corrects historical metrics exactly without duplicating or overwriting Shopee/manual fields", async () => {
  const metaAccount = await prisma.metaAccount.findFirst({ select: { id: true } });
  assert.ok(metaAccount);
  await assert.rejects(prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.create({ data: { metaCampaignId: `meta-semantic-${randomUUID()}`, name: "Semantic Test", budgetSource: "UNRESOLVED", metaAccountId: metaAccount.id } });
    const date = new Date("2026-09-05T00:00:00.000Z");
    await tx.campaignDailyMetric.create({ data: { campaignId: campaign.id, date, spend: "1", clickFp: 2651, cpcFp: "20.244813", commission: "9.12345", shopeeClicks: 7, note: "keep", completed: true } });
    const metaFields = metaFieldsFromInsight({ spend: "53669", inline_link_clicks: "1222", cost_per_inline_link_click: "43.918985" });
    await tx.campaignDailyMetric.upsert({ where: { campaignId_date: { campaignId: campaign.id, date } }, create: { campaignId: campaign.id, date, ...metaFields }, update: metaFields });
    const rows = await tx.campaignDailyMetric.findMany({ where: { campaignId: campaign.id, date } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].spend?.toString(), "53669");
    assert.equal(rows[0].clickFp, 1222);
    assert.equal(rows[0].cpcFp?.toFixed(6), "43.918985");
    assert.equal(rows[0].commission?.toFixed(5), "9.12345");
    assert.equal(rows[0].shopeeClicks, 7);
    assert.equal(rows[0].note, "keep");
    assert.equal(rows[0].completed, true);
    throw new RollbackFixture();
  }), RollbackFixture);
});

test.after(async () => prisma.$disconnect());
