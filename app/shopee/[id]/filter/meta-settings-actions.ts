"use server";

import { requireUser } from "@/lib/auth/session";
import { campaignModes, type CampaignMode } from "@/lib/filter/campaign-modes";
import { campaignModeWhere } from "@/lib/filter/queries";
import { MetaCampaignReadClient } from "@/lib/meta-campaign-controls/read-client";
import { readMetaCampaignSettings } from "@/lib/meta-campaign-settings/reader";
import type { MetaCampaignSettingsActionResult, MetaCampaignSettingsTarget } from "@/lib/meta-campaign-settings/types";
import { prisma } from "@/lib/prisma";

function parseInput(value: unknown): { shopeeAccountId: number; campaignId: number; mode: CampaignMode } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["shopeeAccountId", "campaignId", "mode"].includes(key))
    || !Number.isSafeInteger(input.shopeeAccountId) || (input.shopeeAccountId as number) <= 0
    || !Number.isSafeInteger(input.campaignId) || (input.campaignId as number) <= 0
    || !campaignModes.includes(input.mode as CampaignMode)) return null;
  return { shopeeAccountId: input.shopeeAccountId as number, campaignId: input.campaignId as number, mode: input.mode as CampaignMode };
}

export async function getMetaCampaignSettingsAction(input: unknown): Promise<MetaCampaignSettingsActionResult> {
  await requireUser({ readOnly: true });
  const parsed = parseInput(input);
  if (!parsed) return { success: false, message: "Target pengaturan Meta tidak valid." };
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: parsed.campaignId, ...campaignModeWhere(parsed.mode), metaAccount: { shopeeAccountId: parsed.shopeeAccountId } },
      select: { id: true, metaCampaignId: true, name: true, metaAccount: { select: { name: true, shopeeAccount: { select: { name: true } } } } },
    });
    if (!campaign?.metaAccount.shopeeAccount || !/^[0-9]{1,100}$/.test(campaign.metaCampaignId)) return { success: false, message: "Campaign tidak ditemukan dalam Shopee dan halaman yang dipilih." };
    const target: MetaCampaignSettingsTarget = {
      shopeeName: campaign.metaAccount.shopeeAccount.name,
      wlName: campaign.metaAccount.name,
      campaignName: campaign.name,
      campaignId: campaign.id,
      metaCampaignId: campaign.metaCampaignId,
    };
    const client = new MetaCampaignReadClient();
    const data = await readMetaCampaignSettings(campaign.metaCampaignId, client);
    return { success: true, target, data, readAt: new Date().toISOString() };
  } catch {
    return { success: false, message: "Pengaturan Meta belum dapat dibaca. Tidak ada data yang diubah. Coba Baca ulang." };
  }
}
