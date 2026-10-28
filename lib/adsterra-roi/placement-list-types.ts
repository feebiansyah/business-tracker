export type PlacementListKind = "blacklist" | "whitelist";

export type PlacementListRead =
  | { status: "SUCCESS"; count: number; readAt: string }
  | { status: "ERROR" | "UNAVAILABLE"; message: string; attemptedAt: string };

export type CampaignPlacementLists = {
  configId: number;
  campaignId: string;
  blacklist: PlacementListRead;
  whitelist: PlacementListRead;
};

export type PlacementListsResult =
  | { success: true; lists: CampaignPlacementLists[] }
  | { success: false; message: string };
