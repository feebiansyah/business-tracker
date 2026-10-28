export type PreviewInput = { shopeeAccountId: number; campaignId: number; mode: "filter" | "fix" };
export type PreviewTarget = {
  shopee: { id: number; name: string };
  wl: { id: string; name: string };
  campaign: { id: string; name: string };
};
export type ReadErrorKind = "AUTH" | "PERMISSION" | "RATE_LIMIT" | "TIMEOUT" | "LIMIT" | "INVALID_RESPONSE" | "INTEGRITY" | "PROVIDER";
export type MetaObjectView = {
  id: string;
  name: string | null;
  configuredStatus: string | null;
  effectiveStatus: string | null;
  diagnostics: { available: boolean; messages: string[] };
};
export type HierarchyPreview = {
  target: PreviewTarget;
  campaign: MetaObjectView;
  adSets: (MetaObjectView & { ads: MetaObjectView[] })[];
  readState: "COMPLETE" | "PARTIAL" | "INTEGRITY_ERROR";
  adSetsComplete: boolean;
  adsComplete: boolean;
  loadedAdCount: number;
  ungroupedAdCount: number;
  warnings: { kind: ReadErrorKind; message: string }[];
  startedAt: string;
  readAt: string;
  requests: number;
};
export type PreviewResult = { success: true; data: HierarchyPreview } | { success: false; message: string; kind?: ReadErrorKind };
