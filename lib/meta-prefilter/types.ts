export type PrefilterSlot = "AWAL" | "AKHIR";
export type PrefilterProgress = {
  runId: string; slot: PrefilterSlot; businessDate: string; requestedAt: string;
  status: string; current: number; total: number; pages: number; skipped: string[]; message: string | null;
};
export type PrefilterRow = {
  metaCampaignId: string; campaignName: string; metaAccountId: number; wlName: string;
  configuredStatus: string | null; effectiveStatus: string | null;
  spend: string; withFee: string; clicks: string | null; cpc: string | null;
};
export type PrefilterSnapshot = { runId: string; requestedAt: string; finishedAt: string; skipped: string[]; rows: PrefilterRow[] };
export type PrefilterNote = { metaCampaignId: string; note: string; completed: boolean };
export type PrefilterData = { account: { id: number; name: string }; businessDate: string; snapshots: Record<PrefilterSlot, PrefilterSnapshot | null>; progress: PrefilterProgress | null; notes: PrefilterNote[] };
export type PrefilterBatch = { progress: PrefilterProgress; shouldContinue: boolean; blocked: boolean };
