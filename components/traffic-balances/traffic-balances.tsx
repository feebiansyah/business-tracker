"use client";

import { startTransition, useEffect, useState, useSyncExternalStore } from "react";
import { getTrafficBalancesAction } from "@/app/traffic-balances/actions";
import { createBalanceStore } from "@/lib/traffic-balances/refresh-state";
import type { BalanceKey } from "@/lib/traffic-balances/types";
import { BalanceDashboardView, BalanceOverviewView, type BalanceAccount } from "./balance-view";

export function TrafficBalances({ accounts, variant }: { accounts: BalanceAccount[]; variant: "overview" | "dashboard" }) {
  const [store] = useState(() => createBalanceStore(async (keys) => {
    const response = await getTrafficBalancesAction(keys);
    if (!response.success) throw new Error("Balance load failed");
    return response.balances;
  }));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  // Names and RSC prop identity changes must not trigger duplicate provider requests.
  const accountIds = JSON.stringify(accounts.map((account) => account.id));
  useEffect(() => {
    const ids: number[] = JSON.parse(accountIds);
    const keys: BalanceKey[] = ids.flatMap((shopeeAccountId) => [
      { shopeeAccountId, provider: "CLICKADU" }, { shopeeAccountId, provider: "ADSTERRA" },
    ]);
    startTransition(() => { void store.refresh(keys); });
  }, [accountIds, store]);

  const refresh = (keys: BalanceKey[]) => { startTransition(() => { void store.refresh(keys); }); };
  const props = {
    accounts, state,
    onRefresh: (key: BalanceKey) => refresh([key]),
    onRefreshAll: () => refresh(accounts.flatMap((account) => [
      { shopeeAccountId: account.id, provider: "CLICKADU" as const },
      { shopeeAccountId: account.id, provider: "ADSTERRA" as const },
    ])),
  };
  return variant === "overview" ? <BalanceOverviewView {...props} /> : <BalanceDashboardView {...props} />;
}
