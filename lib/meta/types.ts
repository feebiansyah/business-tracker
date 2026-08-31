export type MetaBusiness = { id: string; name: string };

export type MetaAdAccount = {
  id: string;
  account_id?: string;
  name: string;
  account_status?: number;
};

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
