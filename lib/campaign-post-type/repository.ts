import "server-only";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { parsePostTypeInput, type ManualPostType, type PostTypeInput } from "./model";
import { lockShopeeAccounts } from "@/lib/shopee/account-lock";

type OverrideDb = Pick<PrismaClient, "campaignPostTypeOverride">;

export async function readPostTypeOverrides(shopeeAccountId: number, metaCampaignIds: string[], db: OverrideDb = prisma): Promise<Record<string, ManualPostType>> {
  if (!metaCampaignIds.length) return {};
  const rows = await db.campaignPostTypeOverride.findMany({
    where: { shopeeAccountId, metaCampaignId: { in: [...new Set(metaCampaignIds)] } },
    select: { metaCampaignId: true, manualType: true },
  });
  return Object.fromEntries(rows.map(row => [row.metaCampaignId, row.manualType]));
}

// Server-side callers must prove membership before writing; no Campaign is created.
export async function writePostTypeOverride(value: PostTypeInput, db: OverrideDb = prisma) {
  const input = parsePostTypeInput(value);
  const { manualType, ...key } = input;
  if (manualType === null) await db.campaignPostTypeOverride.deleteMany({ where: key });
  else await db.campaignPostTypeOverride.upsert({
    where: { shopeeAccountId_metaCampaignId: key }, create: { ...key, manualType }, update: { manualType },
  });
  return { manualType };
}

export async function saveCampaignPostType(value: unknown, db: Pick<PrismaClient, "$transaction"> = prisma) {
  const input = parsePostTypeInput(value);
  return db.$transaction(async tx=>{
  await lockShopeeAccounts(tx,[input.shopeeAccountId]);
  const campaign = await tx.campaign.findFirst({
    where: { metaCampaignId: input.metaCampaignId, metaAccount: { shopeeAccountId: input.shopeeAccountId } }, select: { id: true },
  });
  if (!campaign) throw new Error("Campaign tidak ditemukan dalam akun Shopee ini.");
  return writePostTypeOverride(input, tx);
  },{isolationLevel:"ReadCommitted",maxWait:5_000,timeout:10_000});
}
