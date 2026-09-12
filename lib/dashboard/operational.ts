export type OperationalAccountInput = {
  id: number;
  name: string;
  metaAccounts: { spendHistorySyncedThrough: Date | null; activeCampaignCount: number }[];
  commissionCovered: boolean;
  clickCovered: boolean;
};

export type OperationalAccountStatus = {
  id: number;
  name: string;
  wlCount: number;
  meta: { complete: boolean; coveredWlCount: number; totalWlCount: number };
  commissionComplete: boolean;
  clickComplete: boolean;
  complete: boolean;
};

const dateKey = (value: Date) => value.toISOString().slice(0, 10);

export function getJakartaPreviousDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  const jakartaToday = new Date(`${part("year")}-${part("month")}-${part("day")}T00:00:00.000Z`);
  jakartaToday.setUTCDate(jakartaToday.getUTCDate() - 1);
  return dateKey(jakartaToday);
}

export function buildOperationalDashboard(accounts: OperationalAccountInput[], targetDate: string) {
  const statuses: OperationalAccountStatus[] = accounts.map((account) => {
    const coveredWlCount = account.metaAccounts.filter((wl) => wl.spendHistorySyncedThrough !== null && dateKey(wl.spendHistorySyncedThrough) >= targetDate).length;
    const metaComplete = account.metaAccounts.length > 0 && coveredWlCount === account.metaAccounts.length;
    return {
      id: account.id,
      name: account.name,
      wlCount: account.metaAccounts.length,
      meta: { complete: metaComplete, coveredWlCount, totalWlCount: account.metaAccounts.length },
      commissionComplete: account.commissionCovered,
      clickComplete: account.clickCovered,
      complete: metaComplete && account.commissionCovered && account.clickCovered,
    };
  });
  return {
    targetDate,
    accounts: statuses,
    summary: {
      totalShopee: statuses.length,
      totalWl: accounts.reduce((sum, account) => sum + account.metaAccounts.length, 0),
      activeCampaigns: accounts.reduce((sum, account) => sum + account.metaAccounts.reduce((wlSum, wl) => wlSum + wl.activeCampaignCount, 0), 0),
      needsAttention: statuses.filter((account) => !account.complete).length,
    },
  };
}
