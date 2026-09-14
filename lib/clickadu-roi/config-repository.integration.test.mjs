import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import "dotenv/config";

import { PrismaClient } from "../generated/prisma/client.ts";
import {
  deleteClickaduConfig,
  getClickaduConfigPageData,
  saveClickaduConfig,
} from "./config-repository.ts";

const prisma = new PrismaClient();
class Rollback extends Error {}

test("configuration CRUD stays scoped to its Shopee account", async () => {
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      const suffix = randomUUID();
      const accountA = await tx.shopeeAccount.create({ data: { name: "Clickadu A", shopId: `clickadu-a-${suffix}` } });
      const accountB = await tx.shopeeAccount.create({ data: { name: "Clickadu B", shopId: `clickadu-b-${suffix}` } });

      const configA = await saveClickaduConfig(tx, accountA.id, {
        campaignId: " campaign-shared ",
        label: " ",
        sourceTag: " adu ",
      });
      const configB = await saveClickaduConfig(tx, accountB.id, {
        campaignId: "campaign-shared",
        label: "Other",
        sourceTag: "adu1",
      });

      assert.equal(configA.campaignId, "campaign-shared");
      assert.equal(configA.label, null);
      assert.equal(configA.sourceTag, "ADU");
      assert.deepEqual((await getClickaduConfigPageData(tx, accountA.id))?.configs.map((row) => row.id), [configA.id]);

      await assert.rejects(
        saveClickaduConfig(tx, accountA.id, {
          id: configB.id,
          campaignId: "stolen",
          label: null,
          sourceTag: "ADU",
        }),
        /tidak ditemukan/i,
      );
      await assert.rejects(deleteClickaduConfig(tx, accountA.id, configB.id), /tidak ditemukan/i);
      assert.ok(await tx.clickaduCampaignConfig.findUnique({ where: { id: configB.id } }));

      await assert.rejects(
        saveClickaduConfig(tx, accountA.id, {
          campaignId: "campaign-shared",
          label: null,
          sourceTag: "ADU",
        }),
        /sudah ada/i,
      );
      assert.equal(await deleteClickaduConfig(tx, accountA.id, configA.id), true);
      throw new Rollback();
    }),
    Rollback,
  );
});

test.after(async () => prisma.$disconnect());
