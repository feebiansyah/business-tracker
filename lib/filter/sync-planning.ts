import { buildMonthlyChunks, getRequiredHistoryStart } from "./date-ranges.ts";

export type CoverageCampaign = { id: number; startDate: string | null; historySyncedThrough: string | null; metricSemanticVersion?: number };
export type CoverageChunk = { since: string; until: string; campaignIds: number[] };

export function planCampaignCoverage(campaigns: CoverageCampaign[], today: string) {
  const chunksByRange = new Map<string, CoverageChunk>();
  const missingStartCampaignIds: number[] = [];
  const semanticBackfillCampaignIds: number[] = [];

  for (const campaign of campaigns) {
    const needsSemanticBackfill = (campaign.metricSemanticVersion ?? 2) < 2;
    const start = needsSemanticBackfill ? campaign.startDate : getRequiredHistoryStart({ ...campaign, today });
    if (!start) {
      missingStartCampaignIds.push(campaign.id);
      continue;
    }
    const ranges = buildMonthlyChunks(start, today);
    if (needsSemanticBackfill && ranges.length > 0) semanticBackfillCampaignIds.push(campaign.id);
    for (const range of ranges) {
      const key = range.until;
      const chunk = chunksByRange.get(key) ?? { ...range, campaignIds: [] };
      if (range.since < chunk.since) chunk.since = range.since;
      if (!chunk.campaignIds.includes(campaign.id)) chunk.campaignIds.push(campaign.id);
      chunksByRange.set(key, chunk);
    }
  }

  return {
    chunks: [...chunksByRange.values()].sort((a, b) => a.since.localeCompare(b.since)),
    missingStartCampaignIds,
    semanticBackfillCampaignIds,
  };
}

export function checkpointUpdatesForSuccessfulChunk(chunk: CoverageChunk, insights: unknown[]) {
  void insights;
  return chunk.campaignIds.map((campaignId) => ({ campaignId, historySyncedThrough: chunk.until }));
}
