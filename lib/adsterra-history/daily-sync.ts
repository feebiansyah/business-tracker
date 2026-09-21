import Decimal from "decimal.js";
import type { AdsterraPlacementStatistic, AdsterraStatisticsInput } from "../adsterra-roi/types.ts";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
type DailyConfig = { id: number; campaignId: string; historySyncedThrough: string | null; latestMetricDate: string | null };
export type AdsterraDailyMetricInput = { adsterraCampaignConfigId: number; date: string; spendUsd: string | null };
export type AdsterraDailySyncDependencies = {
  loadConfigs(shopeeAccountId: number): Promise<DailyConfig[]>;
  getStatistics(input: AdsterraStatisticsInput): Promise<Array<Pick<AdsterraPlacementStatistic, "spent">>>;
  persistDay(input: AdsterraDailyMetricInput): Promise<unknown>;
};
export class AdsterraDailySyncError extends Error { constructor(message: string) { super(message); this.name = "AdsterraDailySyncError"; } }
export function indonesiaToday(now = new Date()) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
export function getAdsterraSyncStart(input: { checkpoint: string | null; latestMetricDate: string | null; today: string }) {
  validateDate(input.today); const yesterday = shiftDate(input.today, -1);
  if (input.checkpoint) { validateDate(input.checkpoint); return input.checkpoint >= yesterday ? yesterday : input.checkpoint; }
  if (input.latestMetricDate) { validateDate(input.latestMetricDate); return input.latestMetricDate > input.today ? input.today : input.latestMetricDate; }
  return input.today;
}
export function listDatesInclusive(start: string, end: string) { validateDate(start); validateDate(end); if (start > end) return [end]; const dates: string[] = []; for (let date = start; date <= end; date = shiftDate(date, 1)) dates.push(date); return dates; }
export function sumPlacementSpend(rows: ReadonlyArray<{ spent: string }>) { if (rows.length === 0) return null; return rows.reduce((sum, row) => sum.plus(parseMoney(row.spent)), new Decimal(0)).toString(); }
export async function syncAdsterraDailyMetrics(input: { shopeeAccountId: number; today: string }, deps: AdsterraDailySyncDependencies) {
  if (!Number.isSafeInteger(input.shopeeAccountId) || input.shopeeAccountId <= 0) throw new AdsterraDailySyncError("Akun Shopee tidak valid."); validateDate(input.today);
  const configs = await deps.loadConfigs(input.shopeeAccountId); let dateCount = 0; let earliestStart: string | null = null;
  for (const config of configs) { const start = getAdsterraSyncStart({ checkpoint: config.historySyncedThrough, latestMetricDate: config.latestMetricDate, today: input.today }); if (earliestStart === null || start < earliestStart) earliestStart = start;
    for (const date of listDatesInclusive(start, input.today)) { const statistics = await deps.getStatistics({ campaignId: config.campaignId, dateFrom: date, dateTill: date }); await deps.persistDay({ adsterraCampaignConfigId: config.id, date, spendUsd: sumPlacementSpend(statistics) }); dateCount += 1; }
  }
  return { configCount: configs.length, dateCount, from: earliestStart, through: configs.length ? input.today : null };
}
function shiftDate(value: string, days: number) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function validateDate(value: string) { if (!DATE_PATTERN.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new AdsterraDailySyncError("Tanggal sync Adsterra tidak valid."); }
function parseMoney(value: unknown) { try { const result = new Decimal(String(value)); if (!result.isFinite() || result.isNegative()) throw new Error(); return result; } catch { throw new AdsterraDailySyncError("Spend Adsterra tidak valid."); } }
