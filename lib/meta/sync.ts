import "server-only";

import { MetaGraphClient } from "@/lib/meta/client";
import type { MetaAdAccount, MetaSyncSummary } from "@/lib/meta/types";
import { prisma } from "@/lib/prisma";

type BusinessRelation = "OWNED" | "CLIENT";
type BusinessMatch = { businessId: string; relation: BusinessRelation };
type MasterAccount = {
  accountId: string;
  name: string;
  status?: string;
  businessMatches: BusinessMatch[];
};

function getAccountId(account: MetaAdAccount) {
  return (account.account_id || account.id.replace(/^act_/, "")).trim();
}

function getAccountStatus(accountStatus?: number) {
  if (accountStatus === undefined) return undefined;
  return accountStatus === 1 ? "ACTIVE" : "INACTIVE";
}

function addBusinessMatch(account: MasterAccount, businessId: string, relation: BusinessRelation) {
  const existingIndex = account.businessMatches.findIndex((match) => match.businessId === businessId);
  if (existingIndex === -1) {
    account.businessMatches.push({ businessId, relation });
    return;
  }
  if (relation === "OWNED") account.businessMatches[existingIndex] = { businessId, relation };
}

function selectBusiness(matches: BusinessMatch[]) {
  return matches.find((match) => match.relation === "OWNED") ?? matches[0];
}

export async function syncMetaBusinessData(): Promise<MetaSyncSummary> {
  const client = new MetaGraphClient();
  const businessesFromApi = await client.getBusinesses();
  const accountsFromApi = await client.getAdAccounts();
  const businesses = new Map(businessesFromApi.map((business) => [business.id, business]));
  const masterAccounts = new Map<string, MasterAccount>();

  for (const account of accountsFromApi) {
    const accountId = getAccountId(account);
    if (!accountId || masterAccounts.has(accountId)) continue;
    masterAccounts.set(accountId, {
      accountId,
      name: account.name || accountId,
      status: getAccountStatus(account.account_status),
      businessMatches: [],
    });
  }

  const businessList = [...businesses.values()];
  for (const [businessIndex, business] of businessList.entries()) {
    const ownedAccounts = await client.getOwnedAdAccounts(business.id);
    const clientAccounts = await client.getClientAdAccounts(business.id);
    for (const account of ownedAccounts) {
      const masterAccount = masterAccounts.get(getAccountId(account));
      if (masterAccount) addBusinessMatch(masterAccount, business.id, "OWNED");
    }
    for (const account of clientAccounts) {
      const masterAccount = masterAccounts.get(getAccountId(account));
      if (masterAccount) addBusinessMatch(masterAccount, business.id, "CLIENT");
    }
    if (businessIndex < businessList.length - 1) await client.waitBetweenBusinesses();
  }

  const accountIds = [...masterAccounts.keys()];
  const existingAccounts = accountIds.length
    ? await prisma.metaAccount.findMany({
        where: { accountId: { in: accountIds } },
        select: { accountId: true, name: true, status: true, businessManager: { select: { bmId: true } } },
      })
    : [];
  const existingById = new Map(existingAccounts.map((account) => [account.accountId, account]));
  let metaAccountsCreated = 0;
  let metaAccountsUpdated = 0;
  let metaAccountsExisting = 0;
  let metaAccountsWithoutBusiness = 0;
  let metaAccountsWithMultipleBusinesses = 0;

  await prisma.$transaction(async (transaction) => {
    const databaseBusinesses = new Map<string, number>();
    for (const business of businesses.values()) {
      const saved = await transaction.businessManager.upsert({
        where: { bmId: business.id },
        create: { bmId: business.id, name: business.name || business.id },
        update: { name: business.name || business.id },
        select: { id: true },
      });
      databaseBusinesses.set(business.id, saved.id);
    }

    for (const account of masterAccounts.values()) {
      const selectedMatch = selectBusiness(account.businessMatches);
      const businessManagerId = selectedMatch ? databaseBusinesses.get(selectedMatch.businessId) ?? null : null;
      const selectedBusinessId = selectedMatch?.businessId ?? null;
      if (!selectedMatch) metaAccountsWithoutBusiness += 1;
      if (account.businessMatches.length > 1) metaAccountsWithMultipleBusinesses += 1;

      const existing = existingById.get(account.accountId);
      const existingBusinessId = existing?.businessManager?.bmId ?? null;
      const changed = Boolean(existing && (
        existing.name !== account.name ||
        existingBusinessId !== selectedBusinessId ||
        (account.status !== undefined && existing.status !== account.status)
      ));
      if (!existing) metaAccountsCreated += 1;
      else if (changed) metaAccountsUpdated += 1;
      else metaAccountsExisting += 1;

      await transaction.metaAccount.upsert({
        where: { accountId: account.accountId },
        create: {
          accountId: account.accountId,
          name: account.name,
          status: account.status ?? "ACTIVE",
          businessManagerId,
        },
        update: {
          name: account.name,
          businessManagerId,
          ...(account.status === undefined ? {} : { status: account.status }),
        },
      });
    }
  }, { maxWait: 10_000, timeout: 60_000 });

  return {
    businessManagersFound: businesses.size,
    metaAccountsFromApi: accountsFromApi.length,
    uniqueMetaAccounts: masterAccounts.size,
    metaAccountsCreated,
    metaAccountsUpdated,
    metaAccountsExisting,
    metaAccountsWithoutBusiness,
    metaAccountsWithMultipleBusinesses,
  };
}
