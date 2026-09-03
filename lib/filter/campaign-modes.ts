export const campaignModes = ["filter", "fix", "off-filter", "off-fix"] as const;
export type CampaignMode = typeof campaignModes[number];

export const campaignModeConfig: Record<CampaignMode, { route: CampaignMode; title: string; active: boolean; minimumBudget: boolean; description: string }> = {
  filter: { route: "filter", title: "Filter", active: true, minimumBudget: false, description: "Campaign ACTIVE · Budget di bawah Rp200.000" },
  fix: { route: "fix", title: "Fix", active: true, minimumBudget: true, description: "Campaign ACTIVE · Budget Rp200.000 atau lebih" },
  "off-filter": { route: "off-filter", title: "OFF Filter", active: false, minimumBudget: false, description: "Campaign OFF · Budget di bawah Rp200.000" },
  "off-fix": { route: "off-fix", title: "OFF Fix", active: false, minimumBudget: true, description: "Campaign OFF · Budget Rp200.000 atau lebih" },
};

export function campaignMatchesMode(mode: CampaignMode, status: string | null, budget: number | null) {
  if (budget === null) return false;
  const config = campaignModeConfig[mode];
  const statusMatches = config.active ? status === "ACTIVE" : status !== "ACTIVE";
  const budgetMatches = config.minimumBudget ? budget >= 200000 : budget < 200000;
  return statusMatches && budgetMatches;
}
