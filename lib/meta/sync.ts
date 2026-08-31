import "server-only";

import { MetaGraphClient } from "@/lib/meta/client";
import type { MetaAdAccount, MetaSyncSummary } from "@/lib/meta/types";
import { prisma } from "@/lib/prisma";

type MasterAccount = {
  accountId: string;
  name: string;
  status?: string;
};

function getAccountId(account: MetaAdAccount) {
  return (account.account_id || account.id.replace(/^act_/, "")).trim();
}

function getAccountStatus(accountStatus?: number) {
  if (accountStatus === undefined) return undefined;
  return accountStatus === 1 ? "ACTIVE" : "INACTIVE";
}

export async function syncMetaAccounts(): Promise<MetaSyncSummary> {
  const accountsFromApi = await new MetaGraphClient().getAdAccounts();
  const masterAccounts = new Map<string, MasterAccount>();

  for (const account of accountsFromApi) {
    const accountId = getAccountId(account);
    if (!accountId || masterAccounts.has(accountId)) continue;
    masterAccounts.set(accountId, {
      accountId,
      name: account.name || accountId,
      status: getAccountStatus(account.account_status),
    });
  }

  const accountIds = [...masterAccounts.keys()];
  const existingAccounts = accountIds.length
    ? await prisma.metaAccount.findMany({
        where: { accountId: { in: accountIds } },
        select: { accountId: true, name: true, status: true },
      })
    : [];
  const existingById = new Map(existingAccounts.map((account) => [account.accountId, account]));
  let metaAccountsCreated = 0;
  let metaAccountsUpdated = 0;
  let metaAccountsExisting = 0;

  await prisma.$transaction(async (transaction) => {
    for (const account of masterAccounts.values()) {
      const existing = existingById.get(account.accountId);
      const changed = Boolean(existing && (
        existing.name !== account.name ||
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
          businessManagerId: null,
        },
        update: {
          name: account.name,
          ...(account.status === undefined ? {} : { status: account.status }),
        },
      });
    }
  }, { maxWait: 10_000, timeout: 60_000 });

  return {
    metaAccountsFromApi: accountsFromApi.length,
    uniqueMetaAccounts: masterAccounts.size,
    metaAccountsCreated,
    metaAccountsUpdated,
    metaAccountsExisting,
  };
}
