export type MetaAdSetSettings = {
  id: string;
  name: string;
  createdAt: string | null;
  configuredStatus: string | null;
  effectiveStatus: string | null;
  contentType: string;
  placements: string;
  age: string;
  locations: string;
  gender: string;
};

export type MetaCampaignSettingsView = {
  reference: MetaAdSetSettings | null;
  adSetCount: number;
  matchingAdSetCount: number;
  differences: MetaAdSetSettings[];
  sameAcrossAll: boolean;
  partial: boolean;
  warnings: string[];
};

export type MetaCampaignSettingsTarget = {
  shopeeName: string;
  wlName: string;
  campaignName: string;
  campaignId: number;
  metaCampaignId: string;
};

export type MetaCampaignSettingsActionResult =
  | { success: true; target: MetaCampaignSettingsTarget; data: MetaCampaignSettingsView; readAt: string }
  | { success: false; message: string };
