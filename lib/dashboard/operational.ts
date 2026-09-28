export type OperationalAccountInput = {
  id: number;
  name: string;
  metaAccounts: { spendHistorySyncedThrough: Date | null; activeCampaignCount: number }[];
  commissionCovered: boolean;
  clickCovered: boolean;
  clickaduCampaignConfigs: { lastBlacklistReplacedAt: Date | null }[];
  adsterraCampaignConfigs: { lastBlacklistReplacedAt: Date | null }[];
};

export type OperationalAccountStatus = {
  id: number;
  name: string;
  wlCount: number;
  meta: { complete: boolean; coveredWlCount: number; totalWlCount: number };
  commissionComplete: boolean;
  clickComplete: boolean;
  complete: boolean;
  clickaduPendingReplacementCount: number;
  adsterraPendingReplacementCount: number;
  needsAttention: boolean;
};

const dateKey = (value: Date) => value.toISOString().slice(0, 10);

export function getJakartaDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function getJakartaPreviousDate(now = new Date()) {
  const jakartaToday = new Date(`${getJakartaDate(now)}T00:00:00.000Z`);
  jakartaToday.setUTCDate(jakartaToday.getUTCDate() - 1);
  return dateKey(jakartaToday);
}

export function buildOperationalDashboard(accounts: OperationalAccountInput[], targetDate: string, todayDate = getJakartaDate(new Date())) {
  const statuses: OperationalAccountStatus[] = accounts.map((account) => {
    const coveredWlCount = account.metaAccounts.filter((wl) => wl.spendHistorySyncedThrough !== null && dateKey(wl.spendHistorySyncedThrough) >= targetDate).length;
    const metaComplete = account.metaAccounts.length > 0 && coveredWlCount === account.metaAccounts.length;
    const clickaduPendingReplacementCount = account.clickaduCampaignConfigs.filter((config) => config.lastBlacklistReplacedAt === null || getJakartaDate(config.lastBlacklistReplacedAt) !== todayDate).length;
    const adsterraPendingReplacementCount = account.adsterraCampaignConfigs.filter((config) => config.lastBlacklistReplacedAt === null || getJakartaDate(config.lastBlacklistReplacedAt) !== todayDate).length;
    const complete = metaComplete && account.commissionCovered && account.clickCovered;
    return {
      id: account.id,
      name: account.name,
      wlCount: account.metaAccounts.length,
      meta: { complete: metaComplete, coveredWlCount, totalWlCount: account.metaAccounts.length },
      commissionComplete: account.commissionCovered,
      clickComplete: account.clickCovered,
      complete,
      clickaduPendingReplacementCount,
      adsterraPendingReplacementCount,
      needsAttention: !complete || clickaduPendingReplacementCount > 0 || adsterraPendingReplacementCount > 0,
    };
  });
  return {
    targetDate,
    accounts: statuses,
    summary: {
      totalShopee: statuses.length,
      totalWl: accounts.reduce((sum, account) => sum + account.metaAccounts.length, 0),
      activeCampaigns: accounts.reduce((sum, account) => sum + account.metaAccounts.reduce((wlSum, wl) => wlSum + wl.activeCampaignCount, 0), 0),
      needsAttention: statuses.filter((account) => account.needsAttention).length,
    },
  };
}
