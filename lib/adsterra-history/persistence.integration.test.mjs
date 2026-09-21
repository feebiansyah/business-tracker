import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.ts";
import { persistAdsterraDailyMetricAndCheckpoint } from "./persistence.ts";

const prisma = new PrismaClient();
class Rollback extends Error {}

test("successful empty Adsterra sync clears stale spend and later data replaces it without touching commission", async () => {
  const account = await prisma.shopeeAccount.findFirst({ select: { id: true } });
  assert.ok(account);
  await assert.rejects(prisma.$transaction(async (outer) => {
    const config = await outer.adsterraCampaignConfig.create({ data: { shopeeAccountId: account.id, campaignId: `daily-${randomUUID()}`, sourceTag: `TERRA-${randomUUID()}` } });
    await outer.adsterraCampaignDailyMetric.create({ data: { adsterraCampaignConfigId: config.id, date: new Date("2026-09-21T00:00:00Z"), spendUsd: "20", commissionIdr: "125000" } });
    const db = { $transaction: async (work) => work(outer) };
    await persistAdsterraDailyMetricAndCheckpoint(db, { adsterraCampaignConfigId: config.id, date: "2026-09-21", spendUsd: null });
    let metric = await outer.adsterraCampaignDailyMetric.findUniqueOrThrow({ where: { adsterraCampaignConfigId_date: { adsterraCampaignConfigId: config.id, date: new Date("2026-09-21T00:00:00Z") } } });
    assert.equal(metric.spendUsd, null);
    assert.equal(metric.commissionIdr?.toString(), "125000");
    await persistAdsterraDailyMetricAndCheckpoint(db, { adsterraCampaignConfigId: config.id, date: "2026-09-21", spendUsd: "25" });
    metric = await outer.adsterraCampaignDailyMetric.findUniqueOrThrow({ where: { adsterraCampaignConfigId_date: { adsterraCampaignConfigId: config.id, date: new Date("2026-09-21T00:00:00Z") } } });
    assert.equal(metric.spendUsd?.toString(), "25");
    assert.equal(metric.commissionIdr?.toString(), "125000");
    throw new Rollback();
  }), Rollback);
});

test.after(async () => prisma.$disconnect());
