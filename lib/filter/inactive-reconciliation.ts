import "server-only";

import { prisma } from "@/lib/prisma";
import type { MetaGraphClient } from "@/lib/meta/client";
import { resolveEffectiveDailyBudget } from "@/lib/filter/rules";
import { persistInsightChunk, upsertCampaignMetadata } from "@/lib/filter/persistence";
import { checkpointUpdatesForSuccessfulChunk, planCampaignCoverage } from "@/lib/filter/sync-planning";
import { buildMonthlyChunks, getAccountSpendHistoryStart } from "@/lib/filter/date-ranges";
import { persistMetaAccountDailySpend } from "@/lib/dashboard/account-spend";
import type { FilterSyncSummary } from "@/lib/filter/sync";

type InactiveAccount = { id: number; accountId: string; spendHistorySyncedThrough: Date | null };

function indonesiaDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

export async function reconcileInactiveAccount(wl: InactiveAccount, client: MetaGraphClient, today: string, summary: FilterSyncSummary) {
  const previousDay = new Date(today + "T00:00:00.000Z");
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);
  const through = previousDay.toISOString().slice(0, 10);
  const knownCampaigns = await prisma.campaign.findMany({
    where: { metaAccountId: wl.id },
    select: { id: true, metaCampaignId: true, startTime: true, historySyncedThrough: true },
  });
  const storedByMetaId = new Map(knownCampaigns.map((campaign) => [campaign.metaCampaignId, campaign]));
  // Campaign discovery is account-scoped; Ad Sets are needed only to resolve missing campaign budgets.
  const metaCampaigns = await client.getCampaigns(wl.accountId);
  const needsAdSets = metaCampaigns.some((campaign) => resolveEffectiveDailyBudget(campaign, []).source === "UNRESOLVED");
  const metaAdSets = needsAdSets ? await client.getAdSets(wl.accountId) : [];
  const adSetsByCampaign = new Map<string, typeof metaAdSets>();
  for (const adSet of metaAdSets) {
    const rows = adSetsByCampaign.get(adSet.campaign_id) ?? [];
    rows.push(adSet);
    adSetsByCampaign.set(adSet.campaign_id, rows);
  }
  for (const campaign of metaCampaigns) {
    const budget = resolveEffectiveDailyBudget(campaign, adSetsByCampaign.get(campaign.id) ?? []);
    if (budget.source === "UNRESOLVED") summary.unresolvedBudgets += 1;
    const parsedStart = campaign.start_time ? new Date(campaign.start_time) : null;
    const stored = await upsertCampaignMetadata({
      metaCampaignId: campaign.id,
      name: campaign.name,
      metaAccountId: wl.id,
      startTime: parsedStart && !Number.isNaN(parsedStart.getTime()) ? parsedStart : null,
      metaStatus: campaign.status ?? null,
      effectiveStatus: campaign.effective_status ?? null,
      effectiveDailyBudget: budget.amount,
      budgetSource: budget.source,
    });
    storedByMetaId.set(stored.metaCampaignId, stored);
    // This is current metadata only: do not backdate today's budget into historical snapshots.
    summary.campaignsProcessed += 1;
  }

  const storedCampaigns = [...storedByMetaId.values()];
  const earliestStart = storedCampaigns.reduce<string | null>((earliest, campaign) => {
    if (!campaign.startTime) return earliest;
    const value = indonesiaDate(campaign.startTime);
    return earliest === null || value < earliest ? value : earliest;
  }, null);
  const checkpoint = wl.spendHistorySyncedThrough ? indonesiaDate(wl.spendHistorySyncedThrough) : null;
  const since = getAccountSpendHistoryStart({ earliestStart, spendHistorySyncedThrough: checkpoint, today });
  // No checkpoint/start is not evidence of old coverage; at least reconcile yesterday.
  for (const range of buildMonthlyChunks(since > through ? through : since, through)) {
    const spendRows = await client.getAccountDailySpend(wl.accountId, range);
    if (spendRows.some((row) => row.date_start < range.since || row.date_start > range.until)) throw new Error("Rekonsiliasi spend Meta mengembalikan tanggal di luar rentang.");
    // Retain an existing current-day checkpoint, but never advance it past a persisted chunk.
    const checkpointThrough = checkpoint && checkpoint > range.until ? checkpoint : range.until;
    await prisma.$transaction((tx) => persistMetaAccountDailySpend(tx, wl.id, spendRows, checkpointThrough));
  }

  // Historical insight reads do not require a resolved current budget.
  const historicalCampaigns = storedCampaigns.filter((campaign) => !campaign.startTime || indonesiaDate(campaign.startTime) <= through);
  const coverage = planCampaignCoverage(historicalCampaigns.map((campaign) => ({
    id: campaign.id,
    startDate: campaign.startTime ? indonesiaDate(campaign.startTime) : null,
    historySyncedThrough: campaign.historySyncedThrough ? indonesiaDate(campaign.historySyncedThrough) : null,
  })), today);
  summary.missingStartDates += coverage.missingStartCampaignIds.length;
  const byId = new Map(storedCampaigns.map((campaign) => [campaign.id, campaign]));
  for (const planned of coverage.chunks) {
    if (planned.since > through) continue;
    const chunk = { ...planned, until: planned.until > through ? through : planned.until };
    const targetCampaigns = chunk.campaignIds.map((id) => byId.get(id)).filter((campaign) => campaign !== undefined);
    const byMetaId = new Map(targetCampaigns.map((campaign) => [campaign.metaCampaignId, campaign.id]));
    const insights = await client.getCampaignInsights(wl.accountId, { since: chunk.since, until: chunk.until });
    if (insights.some((row) => row.date_start < chunk.since || row.date_start > chunk.until)) throw new Error("Rekonsiliasi insight Meta mengembalikan tanggal di luar rentang.");
    const updates = checkpointUpdatesForSuccessfulChunk(chunk, insights);
    summary.insightRowsStored += await persistInsightChunk(byMetaId, insights, updates.map((update) => update.campaignId), chunk.until);
  }
}
