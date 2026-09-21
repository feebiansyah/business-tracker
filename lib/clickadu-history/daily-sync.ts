import Decimal from "decimal.js";
import type { ClickaduStatisticsInput, ClickaduZoneStatistic } from "../clickadu-roi/types.ts";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export type ClickaduDailyMetricInput = { clickaduCampaignConfigId: number; date: string; spendUsd: string | null; dailyBudget: string | null };
type DailyConfig = { id: number; campaignId: string; historySyncedThrough: string | null; latestMetricDate: string | null };
type CampaignSnapshot = Record<string, unknown>;
export type ClickaduDailySyncDependencies = {
  loadConfigs(shopeeAccountId: number): Promise<DailyConfig[]>;
  getStatistics(input: ClickaduStatisticsInput): Promise<Array<Pick<ClickaduZoneStatistic, "spent" | "zone">>>;
  getCampaign(campaignId: string): Promise<CampaignSnapshot>;
  persistDay(input: ClickaduDailyMetricInput): Promise<unknown>;
};

export class ClickaduDailySyncError extends Error {
  constructor(message: string) { super(message); this.name = "ClickaduDailySyncError"; }
}

export function indonesiaToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function getClickaduSyncStart(input: { checkpoint: string | null; latestMetricDate: string | null; today: string }) {
  validateDate(input.today);
  const yesterday = shiftDate(input.today, -1);
  if (input.checkpoint) { validateDate(input.checkpoint); return input.checkpoint >= yesterday ? yesterday : input.checkpoint; }
  if (input.latestMetricDate) { validateDate(input.latestMetricDate); return input.latestMetricDate > input.today ? input.today : input.latestMetricDate; }
  return input.today;
}

export function listDatesInclusive(start: string, end: string) {
  validateDate(start); validateDate(end);
  if (start > end) return [end];
  const dates: string[] = [];
  for (let date = start; date <= end; date = shiftDate(date, 1)) dates.push(date);
  return dates;
}

export function sumZoneSpend(statistics: ReadonlyArray<{ spent: string }>) {
  if (statistics.length === 0) return null;
  return statistics.reduce((total, item) => total.plus(parseNonNegativeDecimal(item.spent, "Spend Clickadu")), new Decimal(0)).toString();
}

export function dailyBudgetSnapshot(campaign: CampaignSnapshot, targetDate: string, today: string) {
  if (targetDate !== today || campaign.dailyAmount === null || campaign.dailyAmount === undefined || campaign.dailyAmount === "") return null;
  return parseNonNegativeDecimal(campaign.dailyAmount, "Daily budget Clickadu").toString();
}

export async function syncClickaduDailyMetrics(input: { shopeeAccountId: number; today: string }, deps: ClickaduDailySyncDependencies) {
  validateId(input.shopeeAccountId); validateDate(input.today);
  const configs = await deps.loadConfigs(input.shopeeAccountId);
  let dateCount = 0;
  let earliestStart: string | null = null;
  for (const config of configs) {
    const start = getClickaduSyncStart({ checkpoint: config.historySyncedThrough, latestMetricDate: config.latestMetricDate, today: input.today });
    if (earliestStart === null || start < earliestStart) earliestStart = start;
    for (const date of listDatesInclusive(start, input.today)) {
      const statistics = await deps.getStatistics({ campaignIds: [config.campaignId], dateFrom: date, dateTill: date });
      const campaign = date === input.today ? await deps.getCampaign(config.campaignId) : {};
      await deps.persistDay({ clickaduCampaignConfigId: config.id, date, spendUsd: sumZoneSpend(statistics), dailyBudget: dailyBudgetSnapshot(campaign, date, input.today) });
      dateCount += 1;
    }
  }
  return { configCount: configs.length, dateCount, from: earliestStart, through: configs.length > 0 ? input.today : null };
}

function shiftDate(value: string, days: number) { const date = new Date(`${value}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function validateId(value: number) { if (!Number.isSafeInteger(value) || value <= 0) throw new ClickaduDailySyncError("Akun Shopee tidak valid."); }
function validateDate(value: string) {
  if (!DATE_PATTERN.test(value)) throw new ClickaduDailySyncError("Tanggal sync Clickadu tidak valid.");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) throw new ClickaduDailySyncError("Tanggal sync Clickadu tidak valid.");
}
function parseNonNegativeDecimal(value: unknown, label: string) {
  try { const decimal = new Decimal(String(value)); if (!decimal.isFinite() || decimal.isNegative()) throw new Error("invalid"); return decimal; }
  catch { throw new ClickaduDailySyncError(`${label} tidak valid.`); }
}
