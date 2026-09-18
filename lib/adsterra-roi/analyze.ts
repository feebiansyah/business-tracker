import Decimal from "decimal.js";
import { ShopeeImportError } from "../shopee-import/errors.ts";
import { AdsterraApiError } from "./client.ts";
import { AdsterraConfigError, parseAdsterraConfigId, parseShopeeAccountId } from "./config-input.ts";
import { decodeAdsterraShopeeCsv } from "./csv.ts";
import { aggregateAdsterraCommissions, analyzeAdsterraRoi } from "./analysis.ts";
import type { AdsterraPlacementStatistic, AdsterraStatisticsInput } from "./types.ts";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export class AdsterraAnalysisError extends Error { constructor(message: string) { super(message); this.name = "AdsterraAnalysisError"; } }
export type AdsterraAnalysisConfig = { id: number; campaignId: string; label: string | null; sourceTag: string; shopeeAccountId: number; lastBlacklistReplacedAt: Date | null };
export async function buildAdsterraRoiAnalysis(input: { shopeeAccountId: unknown; configId: unknown; dateFrom: unknown; dateTill: unknown; fxRate: unknown; originalFilename: string; bytes: Uint8Array }, deps: { loadConfig(accountId: number, configId: number): Promise<AdsterraAnalysisConfig | null>; getStatistics(input: AdsterraStatisticsInput): Promise<AdsterraPlacementStatistic[]> }) {
  const shopeeAccountId = parseShopeeAccountId(input.shopeeAccountId); const configId = parseAdsterraConfigId(input.configId); const dateFrom = date(input.dateFrom, "Tanggal mulai"); const dateTill = date(input.dateTill, "Tanggal akhir"); if (dateFrom > dateTill) throw new AdsterraAnalysisError("Rentang tanggal tidak valid."); const fxRate = rate(input.fxRate); const config = await deps.loadConfig(shopeeAccountId, configId); if (!config || config.shopeeAccountId !== shopeeAccountId) throw new AdsterraAnalysisError("Konfigurasi Adsterra tidak ditemukan."); const commissions = aggregateAdsterraCommissions(decodeAdsterraShopeeCsv(input.bytes), config.sourceTag, dateFrom, dateTill); if (!commissions.placements.length) throw new AdsterraAnalysisError("Tidak ada baris Shopee yang cocok dengan Tag Link 1 dan periode."); const statistics = await deps.getStatistics({ campaignId: config.campaignId, dateFrom, dateTill }); if (!statistics.length) throw new AdsterraAnalysisError("Tidak ada statistik Adsterra pada periode tersebut."); return { originalFilename: input.originalFilename, dateFrom, dateTill, fxRate, config, analysis: analyzeAdsterraRoi(statistics, commissions.placements, fxRate) };
}
export function publicAdsterraAnalysisMessage(error: unknown) { return error instanceof AdsterraAnalysisError || error instanceof AdsterraConfigError || error instanceof ShopeeImportError || error instanceof AdsterraApiError ? error.message : "Gagal menganalisis Adsterra ROI."; }
function date(value: unknown, label: string) { if (typeof value !== "string" || !DATE.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new AdsterraAnalysisError(`${label} tidak valid.`); return value; }
function rate(value: unknown) { try { const result = new Decimal(String(value).trim()); if (!result.isPositive()) throw new Error(); return result.toString(); } catch { throw new AdsterraAnalysisError("Kurs USD ke IDR harus lebih dari 0."); } }
