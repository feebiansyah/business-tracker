import "server-only";

import { MetaGraphClient } from "@/lib/meta/client";
import type { MetaAdAccount, MetaBusinessMappingSummary } from "@/lib/meta/types";
import { prisma } from "@/lib/prisma";

const PROGRESS_ID = 1;
const BUSINESS_BATCH_SIZE = 5;

type BusinessRelation = "OWNED" | "CLIENT";
type BusinessMatch = { businessId: string; relation: BusinessRelation };

function getAccountId(account: MetaAdAccount) {
  return (account.account_id || account.id.replace(/^act_/, "")).trim();
}

function addMatch(matchesByAccount: Map<string, BusinessMatch[]>, account: MetaAdAccount, businessId: string, relation: BusinessRelation) {
  const accountId = getAccountId(account);
  if (!accountId) return;
  const matches = matchesByAccount.get(accountId) ?? [];
  const existingIndex = matches.findIndex((match) => match.businessId === businessId);
  if (existingIndex === -1) matches.push({ businessId, relation });
  else if (relation === "OWNED") matches[existingIndex] = { businessId, relation };
  matchesByAccount.set(accountId, matches);
}

function selectMatch(matches: BusinessMatch[]) {
  return matches.find((match) => match.relation === "OWNED") ?? matches[0];
}

async function saveBatch(
  matchesByAccount: Map<string, BusinessMatch[]>,
  businessDatabaseIds: Map<string, number>,
  nextBusinessIndex: number,
  completed: boolean,
) {
  const accountIds = [...matchesByAccount.keys()];
  const accounts = accountIds.length
    ? await prisma.metaAccount.findMany({
        where: { accountId: { in: accountIds } },
        select: { id: true, accountId: true, businessManagerId: true, businessManager: { select: { bmId: true } } },
      })
    : [];

  let metaAccountsMapped = 0;
  let metaAccountsWithMultipleBusinesses = 0;

  await prisma.$transaction(async (transaction) => {
    for (const account of accounts) {
      const matches = matchesByAccount.get(account.accountId) ?? [];
      const selected = selectMatch(matches);
      if (!selected) continue;
      const selectedBusinessManagerId = businessDatabaseIds.get(selected.businessId);
      if (!selectedBusinessManagerId) continue;

      const distinctBusinessIds = new Set(matches.map((match) => match.businessId));
      if (account.businessManager?.bmId && !distinctBusinessIds.has(account.businessManager.bmId)) {
        distinctBusinessIds.add(account.businessManager.bmId);
      }
      if (distinctBusinessIds.size > 1) metaAccountsWithMultipleBusinesses += 1;

      if (selected.relation === "OWNED" || account.businessManagerId === null) {
        await transaction.metaAccount.update({
          where: { id: account.id },
          data: { businessManagerId: selectedBusinessManagerId },
        });
      }
      metaAccountsMapped += 1;
    }

    await transaction.metaBusinessMappingProgress.upsert({
      where: { id: PROGRESS_ID },
      create: { id: PROGRESS_ID, nextBusinessIndex, completed, lastSyncAt: new Date() },
      update: { nextBusinessIndex, completed, lastSyncAt: new Date() },
    });
  }, { maxWait: 10_000, timeout: 60_000 });

  return { metaAccountsMapped, metaAccountsWithMultipleBusinesses };
}

export async function syncMetaBusinessMappings(): Promise<MetaBusinessMappingSummary> {
  const client = new MetaGraphClient();
  const businessesFromApi = await client.getBusinesses();
  const businesses = [...new Map(businessesFromApi.map((business) => [business.id, business])).values()]
    .sort((first, second) => first.id.localeCompare(second.id, undefined, { numeric: true }));

  const progress = await prisma.metaBusinessMappingProgress.findUnique({ where: { id: PROGRESS_ID } });
  const startIndex = progress?.completed || (progress?.nextBusinessIndex ?? 0) >= businesses.length
    ? 0
    : progress?.nextBusinessIndex ?? 0;

  if (progress?.completed) {
    await prisma.metaBusinessMappingProgress.update({
      where: { id: PROGRESS_ID },
      data: { nextBusinessIndex: 0, completed: false },
    });
  }

  const savedBusinesses = await prisma.$transaction(
    businesses.map((business) => prisma.businessManager.upsert({
      where: { bmId: business.id },
      create: { bmId: business.id, name: business.name || business.id },
      update: { name: business.name || business.id },
      select: { id: true, bmId: true },
    })),
  );
  const businessDatabaseIds = new Map(savedBusinesses.map((business) => [business.bmId, business.id]));
  const batch = businesses.slice(startIndex, startIndex + BUSINESS_BATCH_SIZE);
  const matchesByAccount = new Map<string, BusinessMatch[]>();
  let businessesProcessed = 0;

  try {
    for (const [batchIndex, business] of batch.entries()) {
      const ownedAccounts = await client.getOwnedAdAccounts(business.id);
      const clientAccounts = await client.getClientAdAccounts(business.id);
      for (const account of ownedAccounts) addMatch(matchesByAccount, account, business.id, "OWNED");
      for (const account of clientAccounts) addMatch(matchesByAccount, account, business.id, "CLIENT");
      businessesProcessed += 1;
      if (batchIndex < batch.length - 1) await client.waitBetweenBusinesses();
    }
  } catch (error) {
    await saveBatch(matchesByAccount, businessDatabaseIds, startIndex + businessesProcessed, false);
    throw error;
  }

  const nextBusinessIndex = startIndex + businessesProcessed;
  const completed = nextBusinessIndex >= businesses.length;
  const mappingResult = await saveBatch(matchesByAccount, businessDatabaseIds, nextBusinessIndex, completed);

  return {
    businessesProcessed,
    metaAccountsFound: matchesByAccount.size,
    metaAccountsMapped: mappingResult.metaAccountsMapped,
    metaAccountsWithMultipleBusinesses: mappingResult.metaAccountsWithMultipleBusinesses,
    businessesRemaining: Math.max(0, businesses.length - nextBusinessIndex),
    completed,
  };
}
