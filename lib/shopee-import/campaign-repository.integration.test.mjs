import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.ts";
import { loadShopeeCampaignCandidates } from "./campaign-repository.ts";

const prisma = new PrismaClient();
const rollback = new Error("ROLLBACK_CAMPAIGN_REPOSITORY_TEST");

test("loads campaigns once within Shopee scope without status or budget filters", async () => {
  const suffix = randomUUID();
  const shopIds = [`task6-a-${suffix}`, `task6-b-${suffix}`];

  try {
    await prisma.$transaction(async (tx) => {
      const accountA = await tx.shopeeAccount.create({
        data: { name: "Task 6 Account A", shopId: shopIds[0] },
      });
      const accountB = await tx.shopeeAccount.create({
        data: { name: "Task 6 Account B", shopId: shopIds[1] },
      });
      const metaA = await tx.metaAccount.create({
        data: {
          name: "Task 6 WL A",
          accountId: `task6-wl-a-${suffix}`,
          shopeeAccountId: accountA.id,
        },
      });
      const metaB = await tx.metaAccount.create({
        data: {
          name: "Task 6 WL B",
          accountId: `task6-wl-b-${suffix}`,
          shopeeAccountId: accountB.id,
        },
      });
      const campaignA = await tx.campaign.create({
        data: {
          metaCampaignId: `task6-campaign-a-${suffix}`,
          name: "SAME-NAME",
          metaStatus: "PAUSED",
          effectiveStatus: "PAUSED",
          effectiveDailyBudget: "999999.00",
          budgetSource: "CAMPAIGN",
          metaAccountId: metaA.id,
        },
      });
      await tx.campaign.create({
        data: {
          metaCampaignId: `task6-campaign-b-${suffix}`,
          name: "SAME-NAME",
          metaStatus: "ACTIVE",
          effectiveStatus: "ACTIVE",
          effectiveDailyBudget: "100.00",
          budgetSource: "CAMPAIGN",
          metaAccountId: metaB.id,
        },
      });

      assert.deepEqual(await loadShopeeCampaignCandidates(tx, accountA.id), [
        { id: campaignA.id, name: "SAME-NAME" },
      ]);
      throw rollback;
    });
    assert.fail("transaction should roll back test fixtures");
  } catch (error) {
    if (error !== rollback) throw error;
  }

  assert.equal(await prisma.shopeeAccount.count({ where: { shopId: { in: shopIds } } }), 0);
});

test.after(async () => {
  await prisma.$disconnect();
});
