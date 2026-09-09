import { buildMonthlyChunks, getRequiredHistoryStart } from "./date-ranges.ts";

export type CoverageCampaign = { id: number; startDate: string | null; historySyncedThrough: string | null };
export type CoverageChunk = { since: string; until: string; campaignIds: number[] };

export function planCampaignCoverage(campaigns: CoverageCampaign[], today: string) {
  const chunksByRange = new Map<string, CoverageChunk>();
  const missingStartCampaignIds: number[] = [];

  for (const campaign of campaigns) {
    const start = getRequiredHistoryStart({ ...campaign, today });
    if (!start) {
      missingStartCampaignIds.push(campaign.id);
      continue;
    }
    for (const range of buildMonthlyChunks(start, today)) {
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
  };
}

export function checkpointUpdatesForSuccessfulChunk(chunk: CoverageChunk, insights: unknown[]) {
  void insights;
  return chunk.campaignIds.map((campaignId) => ({ campaignId, historySyncedThrough: chunk.until }));
}
