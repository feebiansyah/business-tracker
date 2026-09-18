import Decimal from "decimal.js";

import { ShopeeImportError } from "../shopee-import/errors.ts";
import { decodeClickaduShopeeCsv } from "./csv.ts";
import { ClickaduApiError } from "./client.ts";
import { ClickaduConfigError, parseClickaduConfigId, parseShopeeAccountId } from "./config-input.ts";
import { analyzeClickaduRoi } from "./analysis.ts";
import { aggregateZoneCommissions } from "./shopee-aggregation.ts";
import type { ClickaduStatisticsInput, ClickaduZoneStatistic } from "./types.ts";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ClickaduAnalysisError extends Error {
  constructor(message: string) { super(message); this.name = "ClickaduAnalysisError"; }
}

export type ClickaduAnalysisConfig = {
  id: number; campaignId: string; label: string | null; sourceTag: string; shopeeAccountId: number; lastBlacklistReplacedAt: Date | null;
};

export type BuildClickaduAnalysisInput = {
  shopeeAccountId: unknown; configId: unknown; dateFrom: unknown; dateTill: unknown;
  fxRate: unknown; originalFilename: string; bytes: Uint8Array;
};

export type ClickaduAnalysisDependencies = {
  loadConfig(accountId: number, configId: number): Promise<ClickaduAnalysisConfig | null>;
  getStatistics(input: ClickaduStatisticsInput): Promise<ClickaduZoneStatistic[]>;
};

export type ClickaduAnalysisResult = Awaited<ReturnType<typeof buildClickaduRoiAnalysis>>;

export async function buildClickaduRoiAnalysis(input: BuildClickaduAnalysisInput, deps: ClickaduAnalysisDependencies) {
  const shopeeAccountId = parseShopeeAccountId(input.shopeeAccountId);
  const configId = parseClickaduConfigId(input.configId);
  const dateFrom = parseDate(input.dateFrom, "Tanggal mulai");
  const dateTill = parseDate(input.dateTill, "Tanggal akhir");
  if (dateFrom > dateTill) throw new ClickaduAnalysisError("Rentang tanggal tidak valid.");
  const days = Math.floor((Date.parse(`${dateTill}T00:00:00Z`) - Date.parse(`${dateFrom}T00:00:00Z`)) / 86_400_000) + 1;
  if (days > 366) throw new ClickaduAnalysisError("Rentang tanggal maksimal 366 hari.");
  const fxRate = parseFxRate(input.fxRate);

  const config = await deps.loadConfig(shopeeAccountId, configId);
  if (!config || config.shopeeAccountId !== shopeeAccountId) {
    throw new ClickaduAnalysisError("Konfigurasi Clickadu tidak ditemukan.");
  }
  const csv = aggregateZoneCommissions(decodeClickaduShopeeCsv(input.bytes), config.sourceTag, dateFrom, dateTill);
  const statistics = await deps.getStatistics({ campaignIds: [config.campaignId], dateFrom, dateTill });
  return {
    originalFilename: input.originalFilename,
    dateFrom,
    dateTill,
    fxRate,
    config,
    csv,
    analysis: analyzeClickaduRoi(statistics, csv.zones, fxRate),
  };
}

export function publicClickaduAnalysisMessage(error: unknown) {
  if (error instanceof ClickaduAnalysisError || error instanceof ClickaduConfigError || error instanceof ShopeeImportError || error instanceof ClickaduApiError) return error.message;
  return "Gagal menganalisis Clickadu ROI.";
}

function parseDate(value: unknown, label: string) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) throw new ClickaduAnalysisError(`${label} tidak valid.`);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new ClickaduAnalysisError(`${label} tidak valid.`);
  return value;
}

function parseFxRate(value: unknown) {
  try {
    const rate = new Decimal(typeof value === "string" ? value.trim() : String(value));
    if (!rate.isFinite() || !rate.greaterThan(0)) throw new Error();
    return rate.toString();
  } catch { throw new ClickaduAnalysisError("Kurs USD ke IDR harus lebih dari 0."); }
}
