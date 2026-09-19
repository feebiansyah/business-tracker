import Decimal from "decimal.js";

import type { ClickaduStatisticsInput, ClickaduZoneStatistic } from "../clickadu-roi/types.ts";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type ClickaduDailyMetricInput = {
  clickaduCampaignConfigId: number;
  date: string;
  spendUsd: string | null;
  dailyBudget: string | null;
};

type DailyConfig = { id: number; campaignId: string };
type CampaignSnapshot = Record<string, unknown>;

export type ClickaduDailySyncDependencies = {
  loadConfigs(shopeeAccountId: number): Promise<DailyConfig[]>;
  getStatistics(input: ClickaduStatisticsInput): Promise<Array<Pick<ClickaduZoneStatistic, "spent" | "zone">>>;
  getCampaign(campaignId: string): Promise<CampaignSnapshot>;
  persist(input: ClickaduDailyMetricInput): Promise<unknown>;
};

export class ClickaduDailySyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClickaduDailySyncError";
  }
}

export function indonesiaToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function sumZoneSpend(statistics: ReadonlyArray<{ spent: string }>) {
  if (statistics.length === 0) return null;
  return statistics.reduce((total, item) => total.plus(parseNonNegativeDecimal(item.spent, "Spend Clickadu")), new Decimal(0)).toString();
}

export function dailyBudgetSnapshot(campaign: CampaignSnapshot, targetDate: string, today: string) {
  if (targetDate !== today || campaign.dailyAmount === null || campaign.dailyAmount === undefined || campaign.dailyAmount === "") return null;
  return parseNonNegativeDecimal(campaign.dailyAmount, "Daily budget Clickadu").toString();
}

export async function syncClickaduDailyMetrics(
  input: { shopeeAccountId: number; targetDate: string; today: string },
  deps: ClickaduDailySyncDependencies,
) {
  validateId(input.shopeeAccountId);
  validateDate(input.targetDate);
  validateDate(input.today);
  const configs = await deps.loadConfigs(input.shopeeAccountId);

  for (const config of configs) {
    const statistics = await deps.getStatistics({
      campaignIds: [config.campaignId],
      dateFrom: input.targetDate,
      dateTill: input.targetDate,
    });
    const campaign = input.targetDate === input.today ? await deps.getCampaign(config.campaignId) : {};
    await deps.persist({
      clickaduCampaignConfigId: config.id,
      date: input.targetDate,
      spendUsd: sumZoneSpend(statistics),
      dailyBudget: dailyBudgetSnapshot(campaign, input.targetDate, input.today),
    });
  }

  return { configCount: configs.length, targetDate: input.targetDate };
}

function validateId(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new ClickaduDailySyncError("Akun Shopee tidak valid.");
}

function validateDate(value: string) {
  if (!DATE_PATTERN.test(value)) throw new ClickaduDailySyncError("Tanggal sync Clickadu tidak valid.");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) throw new ClickaduDailySyncError("Tanggal sync Clickadu tidak valid.");
}

function parseNonNegativeDecimal(value: unknown, label: string) {
  try {
    const decimal = new Decimal(String(value));
    if (!decimal.isFinite() || decimal.isNegative()) throw new Error("invalid");
    return decimal;
  } catch {
    throw new ClickaduDailySyncError(`${label} tidak valid.`);
  }
}
