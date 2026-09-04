export type MetaBusiness = { id: string; name: string };

export type MetaAdAccount = {
  id: string;
  account_id?: string;
  name: string;
  account_status?: number;
};

export type MetaCampaign = {
  id: string;
  name: string;
  status?: string;
  effective_status?: string;
  start_time?: string;
  daily_budget?: string;
  lifetime_budget?: string;
};

export type MetaAdSet = {
  id: string;
  campaign_id: string;
  status?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
};

export type MetaInsightRange = { since: string; until: string };

export type MetaCampaignInsight = {
  campaign_id: string;
  campaign_name?: string;
  spend?: string;
  clicks?: string;
  cpc?: string;
  date_start: string;
  date_stop: string;
};

export type MetaAccountDailySpend = { spend?: string; date_start: string; date_stop: string };

export type MetaSyncSummary = {
  metaAccountsFromApi: number;
  uniqueMetaAccounts: number;
  metaAccountsCreated: number;
  metaAccountsUpdated: number;
  metaAccountsExisting: number;
};

export type MetaBusinessMappingSummary = {
  businessesProcessed: number;
  metaAccountsFound: number;
  metaAccountsMapped: number;
  metaAccountsWithMultipleBusinesses: number;
  businessesRemaining: number;
  completed: boolean;
};
