export type PlacementListKind = "blacklist" | "whitelist";

export type PlacementListRead =
  | { status: "SUCCESS"; count: number; digest: string; readAt: string }
  | { status: "ERROR" | "UNAVAILABLE"; message: string; attemptedAt: string };

export type CampaignPlacementLists = {
  configId: number;
  campaignId: string;
  blacklist: PlacementListRead;
  whitelist: PlacementListRead;
  application: import("../adsterra-operations/types").MethodInfo;
};

export type PlacementListsResult =
  | { success: true; lists: CampaignPlacementLists[] }
  | { success: false; message: string };
