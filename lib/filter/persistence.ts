import "server-only";

import { prisma } from "@/lib/prisma";
import { metaFieldsFromInsight } from "@/lib/filter/metrics";
import type { MetaCampaignInsight } from "@/lib/meta/types";
import type { BudgetSource } from "@/lib/filter/types";
import type { Prisma } from "@/lib/generated/prisma/client";

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

export async function upsertCampaignMetadata(input: CampaignMetadataInput, db: Pick<Prisma.TransactionClient, "campaign"> = prisma) {
  const metadata = {
    name: input.name,
    metaAccountId: input.metaAccountId,
    startTime: input.startTime,
    metaStatus: input.metaStatus,
    effectiveStatus: input.effectiveStatus,
    effectiveDailyBudget: input.effectiveDailyBudget,
    budgetSource: input.budgetSource,
  };
  return db.campaign.upsert({
    where: { metaCampaignId: input.metaCampaignId },
    create: { metaCampaignId: input.metaCampaignId, ...metadata },
    update: metadata,
  });
}

function dateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export const META_METRIC_BATCH_SIZE = 100;

// Call only around a short DB unit, never around HTTP or the entire Sync.
export async function retryMetaSyncTransaction<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    try { return await operation(); }
    catch (error) {
      if ((error as { code?: string }).code !== "P2034" || attempt >= 2) throw error;
      await new Promise<void>((resolve,reject) => {
        const onAbort = () => { clearTimeout(timer); signal?.removeEventListener("abort",onAbort); reject(signal?.reason); };
        const timer = setTimeout(() => { signal?.removeEventListener("abort",onAbort); resolve(); }, 50 * 2 ** attempt);
        signal?.addEventListener("abort",onAbort,{ once: true });
        if (signal?.aborted) onAbort();
      });
    }
  }
}

export async function persistInsightChunk(
  campaignsByMetaId: Map<string, number>,
  insights: MetaCampaignInsight[],
  checkpointCampaignIds: number[],
  checkpointThrough: string,
  options: { db?: Prisma.TransactionClient; advanceCheckpoint?: boolean } = {},
) {
  const db = options.db ?? prisma;
  const relevantInsights = insights.filter((row) => campaignsByMetaId.has(row.campaign_id));
  for (let offset = 0; offset < relevantInsights.length; offset += META_METRIC_BATCH_SIZE) {
    const writeGroup = () => relevantInsights.slice(offset, offset + META_METRIC_BATCH_SIZE).map((row) => {
      const campaignId = campaignsByMetaId.get(row.campaign_id)!;
      const date = dateOnly(row.date_start);
      const metaFields = metaFieldsFromInsight(row);
      return db.campaignDailyMetric.upsert({
        where: { campaignId_date: { campaignId, date } },
        create: { campaignId, date, ...metaFields },
        update: metaFields,
      });
    });
    if (options.db) await Promise.all(writeGroup());
    else await retryMetaSyncTransaction(() => prisma.$transaction(writeGroup()));
  }

  if (options.advanceCheckpoint === false) return relevantInsights.length;
  const checkpointDate = dateOnly(checkpointThrough);
  const updateCheckpoint = () => db.campaign.updateMany({
    where: {
      id: { in: checkpointCampaignIds },
      OR: [{ historySyncedThrough: null }, { historySyncedThrough: { lt: checkpointDate } }],
    },
    data: { historySyncedThrough: checkpointDate },
  });
  if (options.db) await updateCheckpoint();
  else await retryMetaSyncTransaction(updateCheckpoint);
  return relevantInsights.length;
}
