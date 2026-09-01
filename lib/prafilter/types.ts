export type MetaCampaign = {
  id: string;
  name: string;
  status?: string;
  effective_status?: string;
  start_time?: string;
};

export type MetaCampaignInsight = {
  campaign_id: string;
  campaign_name?: string;
  account_name?: string;
  clicks?: string;
  cpc?: string;
  spend?: string;
  date_start?: string;
  date_stop?: string;
};

export type PrafilterSyncSummary = {
  campaignsFound: number;
  campaignsSynced: number;
  metaAccountsProcessed: number;
};
