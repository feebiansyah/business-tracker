export type PlacementListKind = "blacklist" | "whitelist";

export type PlacementListRead =
  | { status: "SUCCESS"; count: number; digest: string; readAt: string }
  | { status: "UNREADABLE_WHITELIST"; evidence: import("../adsterra-operations/types").BlacklistUnavailable; digest: string; message: string; attemptedAt: string }
  | { status: "ERROR" | "UNAVAILABLE"; message: string; attemptedAt: string };

export type CampaignPlacementLists = {
  configId: number;
  campaignId: string;
  blacklist: PlacementListRead;
  whitelist: PlacementListRead;
  application: import("../adsterra-operations/types").MethodInfo;
};

export type PlacementListsResult =
  | ({ success: true } & PlacementListBatch)
  | { success: false; message: string };

export type PlacementListCursor = { after: string; scope: string };
export type PlacementListBatch = {
  lists: CampaignPlacementLists[];
  continuation: PlacementListCursor | null;
  progress: { completed: number; total: number };
};
