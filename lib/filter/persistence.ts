import "server-only";

import { prisma } from "@/lib/prisma";
import { dailyMetricMetaUpdate } from "@/lib/filter/metrics";
import type { MetaCampaignInsight } from "@/lib/meta/types";
import type { BudgetSource } from "@/lib/filter/types";

export type CampaignMetadataInput = {
  metaCampaignId: string;
  name: string;
  metaAccountId: number;
  startTime: Date | null;
  metaStatus: string | null;
  effectiveStatus: string | null;
  effectiveDailyBudget: number | null;
  budgetSource: BudgetSource;
};

export async function upsertCampaignMetadata(input: CampaignMetadataInput) {
  const metadata = {
    name: input.name,
    metaAccountId: input.metaAccountId,
    startTime: input.startTime,
    metaStatus: input.metaStatus,
    effectiveStatus: input.effectiveStatus,
    effectiveDailyBudget: input.effectiveDailyBudget,
    budgetSource: input.budgetSource,
  };
  return prisma.campaign.upsert({
    where: { metaCampaignId: input.metaCampaignId },
    create: { metaCampaignId: input.metaCampaignId, ...metadata },
    update: metadata,
  });
}

function dateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function optionalInteger(value: string | undefined) {
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function persistInsightChunk(
  campaignsByMetaId: Map<string, number>,
  insights: MetaCampaignInsight[],
  checkpointCampaignIds: number[],
  checkpointThrough: string,
) {
  const relevantInsights = insights.filter((row) => campaignsByMetaId.has(row.campaign_id));
  if (relevantInsights.length > 0) {
    await prisma.$transaction(relevantInsights.map((row) => {
      const campaignId = campaignsByMetaId.get(row.campaign_id)!;
      const date = dateOnly(row.date_start);
      const metaFields = dailyMetricMetaUpdate({
        spend: row.spend ?? null,
        clickFp: optionalInteger(row.clicks),
        cpcFp: row.cpc ?? null,
      });
      return prisma.campaignDailyMetric.upsert({
        where: { campaignId_date: { campaignId, date } },
        create: { campaignId, date, ...metaFields },
        update: metaFields,
      });
    }));
  }

  const checkpointDate = dateOnly(checkpointThrough);
  await prisma.campaign.updateMany({
    where: {
      id: { in: checkpointCampaignIds },
      OR: [{ historySyncedThrough: null }, { historySyncedThrough: { lt: checkpointDate } }],
    },
    data: { historySyncedThrough: checkpointDate },
  });
  return relevantInsights.length;
}
