export type OperationalAccountInput = {
  id: number;
  name: string;
  metaAccounts: { status?: string; spendHistorySyncedThrough: Date | null; activeCampaignCount: number }[];
  commissionCovered: boolean;
  clickCovered: boolean;
  pendingNoteCount: number;
  clickaduCampaignConfigs: { historySyncedThrough: Date | null; lastBlacklistReplacedAt: Date | null }[];
  adsterraCampaignConfigs: { historySyncedThrough: Date | null; lastBlacklistReplacedAt: Date | null }[];
};

export type OperationalAccountStatus = {
  id: number;
  name: string;
  wlCount: number;
  meta: { complete: boolean; coveredWlCount: number; totalWlCount: number };
  commissionComplete: boolean;
  clickComplete: boolean;
  complete: boolean;
  pendingNoteCount: number;
  emptyActiveWlCount: number;
  clickaduNeverReplacedCount: number;
  adsterraNeverReplacedCount: number;
  clickadu: { totalConfigCount: number; coveredConfigCount: number; complete: boolean };
  adsterra: { totalConfigCount: number; coveredConfigCount: number; complete: boolean };
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

function trafficCoverage(configs: { historySyncedThrough: Date | null }[], targetDate: string) {
  const coveredConfigCount = configs.filter((config) => config.historySyncedThrough !== null && dateKey(config.historySyncedThrough) >= targetDate).length;
  return { totalConfigCount: configs.length, coveredConfigCount, complete: coveredConfigCount === configs.length };
}

export function buildOperationalDashboard(accounts: OperationalAccountInput[], targetDate: string) {
  const statuses: OperationalAccountStatus[] = accounts.map((account) => {
    // WL yang sudah terkonfirmasi nonaktif/tidak tersedia tidak ditagih histori D-1.
    // WL aktif tetap mengikuti aturan kelengkapan yang sudah ada.
    const eligibleWl = account.metaAccounts.filter((wl) => wl.status === undefined || wl.status === "ACTIVE");
    const coveredWlCount = eligibleWl.filter((wl) => wl.spendHistorySyncedThrough !== null && dateKey(wl.spendHistorySyncedThrough) >= targetDate).length;
    const metaComplete = account.metaAccounts.length > 0 && coveredWlCount === eligibleWl.length;
    const emptyActiveWlCount = account.metaAccounts.filter((wl) => wl.status === "ACTIVE" && wl.activeCampaignCount === 0).length;
    const clickadu = trafficCoverage(account.clickaduCampaignConfigs, targetDate);
    const adsterra = trafficCoverage(account.adsterraCampaignConfigs, targetDate);
    const clickaduNeverReplacedCount = account.clickaduCampaignConfigs.filter((config) => config.lastBlacklistReplacedAt === null).length;
    const adsterraNeverReplacedCount = account.adsterraCampaignConfigs.filter((config) => config.lastBlacklistReplacedAt === null).length;
    const complete = metaComplete && account.commissionCovered && account.clickCovered && account.pendingNoteCount === 0 && emptyActiveWlCount === 0 && clickadu.complete && adsterra.complete && clickaduNeverReplacedCount === 0 && adsterraNeverReplacedCount === 0;
    return {
      id: account.id,
      name: account.name,
      wlCount: account.metaAccounts.length,
      meta: { complete: metaComplete, coveredWlCount, totalWlCount: eligibleWl.length },
      commissionComplete: account.commissionCovered,
      clickComplete: account.clickCovered,
      complete,
      pendingNoteCount: account.pendingNoteCount,
      emptyActiveWlCount,
      clickaduNeverReplacedCount,
      adsterraNeverReplacedCount,
      clickadu,
      adsterra,
      needsAttention: !complete,
    };
  });
  return {
    targetDate,
    accounts: statuses,
    summary: {
      totalShopee: statuses.length,
      totalWl: accounts.reduce((sum, account) => sum + account.metaAccounts.length, 0),
      activeCampaigns: accounts.reduce((sum, account) => sum + account.metaAccounts.reduce((wlSum, wl) => wlSum + (wl.status === undefined || wl.status === "ACTIVE" ? wl.activeCampaignCount : 0), 0), 0),
      needsAttention: statuses.filter((account) => account.needsAttention).length,
    },
  };
}
