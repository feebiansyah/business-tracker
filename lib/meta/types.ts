export type MetaBusiness = { id: string; name: string };

export type MetaAdAccount = {
  id: string;
  account_id?: string;
  name: string;
  account_status?: number;
};

export type MetaSyncSummary = {
  businessManagersFound: number;
  metaAccountsFromApi: number;
  uniqueMetaAccounts: number;
  metaAccountsCreated: number;
  metaAccountsUpdated: number;
  metaAccountsExisting: number;
  metaAccountsWithoutBusiness: number;
  metaAccountsWithMultipleBusinesses: number;
};
