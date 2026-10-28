import "server-only";

import { prisma } from "@/lib/prisma";
import { campaignModeWhere } from "@/lib/filter/queries";
import { metaId, record } from "./parse";
import type { PreviewInput, PreviewTarget } from "./types";

export function parsePreviewInput(value: unknown): PreviewInput {
  const input = record(value);
  if (Object.keys(input).some((key) => !["shopeeAccountId", "campaignId", "mode"].includes(key))
    || !Number.isSafeInteger(input.shopeeAccountId) || (input.shopeeAccountId as number) <= 0
    || !Number.isSafeInteger(input.campaignId) || (input.campaignId as number) <= 0
    || (input.mode !== "filter" && input.mode !== "fix")) throw new Error("Input preview tidak valid.");
  return { shopeeAccountId: input.shopeeAccountId as number, campaignId: input.campaignId as number, mode: input.mode };
}

export async function loadPreviewTarget(input: PreviewInput): Promise<PreviewTarget | null> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, ...campaignModeWhere(input.mode), metaAccount: { shopeeAccountId: input.shopeeAccountId } },
    select: { metaCampaignId: true, name: true, metaAccount: { select: { accountId: true, name: true, shopeeAccount: { select: { id: true, name: true } } } } },
  });
  if (!campaign?.metaAccount.shopeeAccount) return null;
  return {
    shopee: campaign.metaAccount.shopeeAccount,
    wl: { id: metaId(campaign.metaAccount.accountId.replace(/^act_/, "")), name: campaign.metaAccount.name },
    campaign: { id: metaId(campaign.metaCampaignId), name: campaign.name },
  };
}
