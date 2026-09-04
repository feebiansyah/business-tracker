import "server-only";

import { prisma } from "@/lib/prisma";
import { MetaGraphClient } from "@/lib/meta/client";
import type { MetaAdSet } from "@/lib/meta/types";
import { resolveEffectiveDailyBudget, isHistorySyncCampaign } from "@/lib/filter/rules";
import { persistInsightChunk, upsertCampaignMetadata } from "@/lib/filter/persistence";
import { checkpointUpdatesForSuccessfulChunk, planCampaignCoverage } from "@/lib/filter/sync-planning";
import { upsertCampaignDailyBudgetSnapshot } from "@/lib/dashboard/budget-snapshots";

export type FilterSyncSummary = {
  wlTotal: number;
  wlSucceeded: number;
  wlFailed: number;
  campaignsProcessed: number;
  insightRowsStored: number;
  unresolvedBudgets: number;
  missingStartDates: number;
  failedWlNames: string[];
};

export class FilterSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FilterSyncError";
  }
}

function indonesiaDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

function startTime(value: string | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function syncFilter(shopeeAccountId: number): Promise<FilterSyncSummary> {
  if (!Number.isInteger(shopeeAccountId) || shopeeAccountId <= 0) throw new FilterSyncError("Akun Shopee tidak valid.");
  const account = await prisma.shopeeAccount.findUnique({
    where: { id: shopeeAccountId },
    select: { id: true, metaAccounts: { select: { id: true, name: true, accountId: true }, orderBy: { name: "asc" } } },
  });
  if (!account) throw new FilterSyncError("Akun Shopee tidak ditemukan.");

  const summary: FilterSyncSummary = {
    wlTotal: account.metaAccounts.length,
    wlSucceeded: 0,
    wlFailed: 0,
    campaignsProcessed: 0,
    insightRowsStored: 0,
    unresolvedBudgets: 0,
    missingStartDates: 0,
    failedWlNames: [],
  };
  if (account.metaAccounts.length === 0) return summary;

  const client = new MetaGraphClient();
  const today = indonesiaDate(new Date());

  for (const [wlIndex, wl] of account.metaAccounts.entries()) {
    try {
      const metaCampaigns = await client.getCampaigns(wl.accountId);
      const metaAdSets = await client.getAdSets(wl.accountId);
      const adSetsByCampaign = new Map<string, MetaAdSet[]>();
      for (const adSet of metaAdSets) {
        const rows = adSetsByCampaign.get(adSet.campaign_id) ?? [];
        rows.push(adSet);
        adSetsByCampaign.set(adSet.campaign_id, rows);
      }

      const storedCampaigns = [];
      for (const campaign of metaCampaigns) {
        const budget = resolveEffectiveDailyBudget(campaign, adSetsByCampaign.get(campaign.id) ?? []);
        if (budget.source === "UNRESOLVED") summary.unresolvedBudgets += 1;
        const stored = await upsertCampaignMetadata({
          metaCampaignId: campaign.id,
          name: campaign.name,
          metaAccountId: wl.id,
          startTime: startTime(campaign.start_time),
          metaStatus: campaign.status ?? null,
          effectiveStatus: campaign.effective_status ?? null,
          effectiveDailyBudget: budget.amount,
          budgetSource: budget.source,
        });
        storedCampaigns.push(stored);
        if (budget.amount !== null) await upsertCampaignDailyBudgetSnapshot(prisma, stored.id, today, budget.amount);
      }
      summary.campaignsProcessed += storedCampaigns.length;

      const historyCampaigns = storedCampaigns.filter((campaign) => isHistorySyncCampaign({
        status: campaign.metaStatus,
        effectiveDailyBudget: campaign.effectiveDailyBudget?.toNumber() ?? null,
      }));
      const coverage = planCampaignCoverage(historyCampaigns.map((campaign) => ({
        id: campaign.id,
        startDate: campaign.startTime ? indonesiaDate(campaign.startTime) : null,
        historySyncedThrough: campaign.historySyncedThrough ? indonesiaDate(campaign.historySyncedThrough) : null,
      })), today);
      summary.missingStartDates += coverage.missingStartCampaignIds.length;

      const byId = new Map(historyCampaigns.map((campaign) => [campaign.id, campaign]));
      for (const chunk of coverage.chunks) {
        const targetCampaigns = chunk.campaignIds.map((id) => byId.get(id)).filter((campaign) => campaign !== undefined);
        const byMetaId = new Map(targetCampaigns.map((campaign) => [campaign.metaCampaignId, campaign.id]));
        const insights = await client.getCampaignInsights(wl.accountId, { since: chunk.since, until: chunk.until });
        const checkpointUpdates = checkpointUpdatesForSuccessfulChunk(chunk, insights);
        summary.insightRowsStored += await persistInsightChunk(
          byMetaId,
          insights,
          checkpointUpdates.map((update) => update.campaignId),
          chunk.until,
        );
      }

      summary.wlSucceeded += 1;
    } catch {
      summary.wlFailed += 1;
      summary.failedWlNames.push(wl.name);
    }
    if (wlIndex < account.metaAccounts.length - 1) await client.waitBetweenAccounts();
  }

  return summary;
}
