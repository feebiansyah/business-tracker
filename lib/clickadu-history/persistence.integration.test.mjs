import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { PrismaClient } from "../generated/prisma/client.ts";
import { upsertClickaduDailyMetric } from "./persistence.ts";

const prisma = new PrismaClient();
class Rollback extends Error {}

test("daily metric upsert is idempotent and preserves other dates", async () => {
  const account = await prisma.shopeeAccount.findFirst({ select: { id: true } });
  assert.ok(account);
  await assert.rejects(prisma.$transaction(async (tx) => {
    const config = await tx.clickaduCampaignConfig.create({
      data: { shopeeAccountId: account.id, campaignId: `daily-${randomUUID()}`, sourceTag: "ADU" },
    });
    await upsertClickaduDailyMetric(tx, { clickaduCampaignConfigId: config.id, date: "2026-09-18", spendUsd: "1.25", dailyBudget: null });
    await upsertClickaduDailyMetric(tx, { clickaduCampaignConfigId: config.id, date: "2026-09-18", spendUsd: "2.5", dailyBudget: null });
    await upsertClickaduDailyMetric(tx, { clickaduCampaignConfigId: config.id, date: "2026-09-19", spendUsd: "3", dailyBudget: "10" });
    const rows = await tx.clickaduCampaignDailyMetric.findMany({ where: { clickaduCampaignConfigId: config.id }, orderBy: { date: "asc" } });
    assert.equal(rows.length, 2);
    assert.equal(rows[0].spendUsd?.toString(), "2.5");
    assert.equal(rows[1].spendUsd?.toString(), "3");
    assert.equal(rows[1].dailyBudget?.toString(), "10");
    throw new Rollback();
  }), Rollback);
});

test.after(async () => prisma.$disconnect());
