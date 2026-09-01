import "server-only";

import { MetaGraphClient } from "@/lib/meta/client";
import { isCampaignStartOnDate, getOperationalDateRange, isValidDateInput } from "@/lib/prafilter/date";
import type { MetaCampaignInsight, PrafilterSyncSummary } from "@/lib/prafilter/types";
import { campaignMetaUpdate, metricMetaUpdate } from "@/lib/prafilter/upsert-data";
import { prisma } from "@/lib/prisma";

export class PrafilterSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrafilterSyncError";
  }
}

function optionalNumber(value?: string) {
  if (value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionalInteger(value?: string) {
  const number = optionalNumber(value);
  return number === null ? null : Math.trunc(number);
}

export async function syncPrafilter(shopeeAccountId: number, selectedDate: string): Promise<PrafilterSyncSummary> {
  if (!Number.isInteger(shopeeAccountId) || !isValidDateInput(selectedDate)) {
    throw new PrafilterSyncError("Akun Shopee atau tanggal Prafilter tidak valid.");
  }

  const shopeeAccount = await prisma.shopeeAccount.findUnique({
    where: { id: shopeeAccountId },
    select: { id: true, metaAccounts: { select: { id: true, accountId: true }, orderBy: { id: "asc" } } },
  });
  if (!shopeeAccount) throw new PrafilterSyncError("Akun Shopee tidak ditemukan.");
  if (shopeeAccount.metaAccounts.length === 0) {
    throw new PrafilterSyncError("Akun Shopee ini belum memiliki WL terhubung. Hubungkan WL sebelum mengambil Prafilter.");
  }

  const client = new MetaGraphClient();
  const metricDate = getOperationalDateRange(selectedDate).start;
  let campaignsFound = 0;
  let campaignsSynced = 0;

  for (const [accountIndex, metaAccount] of shopeeAccount.metaAccounts.entries()) {
    const campaigns = (await client.getCampaigns(metaAccount.accountId))
      .filter((campaign) => isCampaignStartOnDate(campaign.start_time, selectedDate));
    const insights = await client.getCampaignInsights(metaAccount.accountId, selectedDate);
    const insightsByCampaign = new Map<string, MetaCampaignInsight>();
    for (const insight of insights) {
      if (insight.campaign_id && !insightsByCampaign.has(insight.campaign_id)) {
        insightsByCampaign.set(insight.campaign_id, insight);
      }
    }
    campaignsFound += campaigns.length;

    await prisma.$transaction(async (transaction) => {
      for (const campaign of campaigns) {
        const startTime = campaign.start_time ? new Date(campaign.start_time) : null;
        const metaValues = campaignMetaUpdate({
          name: campaign.name || campaign.id,
          startTime: startTime && !Number.isNaN(startTime.getTime()) ? startTime : null,
          metaStatus: campaign.effective_status ?? campaign.status ?? null,
          metaAccountId: metaAccount.id,
        });
        const savedCampaign = await transaction.campaign.upsert({
          where: { metaCampaignId: campaign.id },
          create: { metaCampaignId: campaign.id, ...metaValues },
          update: metaValues,
          select: { id: true },
        });

        const insight = insightsByCampaign.get(campaign.id);
        const metricValues = metricMetaUpdate({
          spend: insight ? optionalNumber(insight.spend) : 0,
          clicks: insight ? optionalInteger(insight.clicks) : 0,
          cpc: insight ? optionalNumber(insight.cpc) : null,
        });
        await transaction.campaignDailyMetric.upsert({
          where: { campaignId_date: { campaignId: savedCampaign.id, date: metricDate } },
          create: { campaignId: savedCampaign.id, date: metricDate, ...metricValues },
          update: metricValues,
        });
        campaignsSynced += 1;
      }
    }, { maxWait: 10_000, timeout: 60_000 });

    if (accountIndex < shopeeAccount.metaAccounts.length - 1) await client.waitBetweenAccounts();
  }

  return { campaignsFound, campaignsSynced, metaAccountsProcessed: shopeeAccount.metaAccounts.length };
}
