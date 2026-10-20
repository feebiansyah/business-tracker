import Decimal from "decimal.js";

import { AdsterraAmbiguousWriteError, AdsterraApiError } from "./client.ts";
import type { AdsterraCustomBid, AdsterraRoiRow } from "./types.ts";
import { hasMinimumDecisionCost } from "../traffic-roi/decision.ts";
import { isAdsterraBlacklistCandidate } from "./decision.ts";
import { runVerifiedBlacklistReplacement } from "../traffic-roi/replacement-timestamp.ts";

type AnalyzedPlacement = Pick<AdsterraRoiRow, "placement" | "costIdr" | "roi" | "clicks" | "impressions">;

export class AdsterraBlacklistError extends Error {
  readonly stage: "PROVIDER_WRITE" | "PROVIDER_VERIFICATION";
  constructor(message: string, stage: "PROVIDER_WRITE" | "PROVIDER_VERIFICATION" = "PROVIDER_VERIFICATION") { super(message); this.name = "AdsterraBlacklistError"; this.stage = stage; }
}

export type AdsterraBlacklistDependencies = {
  getBlacklist(campaignId: string): Promise<number[]>;
  replaceBlacklist(campaignId: string, placementIds: readonly number[]): Promise<void>;
};

export function placementSetsEqual(left: readonly unknown[], right: readonly unknown[]) {
  const a = normalizeForTarget(left); const b = normalizeForTarget(right);
  return a.length === b.length && a.every((placement) => b.includes(placement));
}

export function buildAdsterraBlacklistTarget(existingValues: readonly unknown[], rows: readonly AnalyzedPlacement[]) {
  const existing = normalizeForTarget(existingValues);
  const target = new Set<number>();
  for (const row of rows) {
    const cost = nonNegativeDecimal(row.costIdr);
    if (!hasMinimumDecisionCost(cost)) continue;
    const placement = placementId(row.placement);
    const roi = row.roi === null ? null : decimal(row.roi);
    if (isAdsterraBlacklistCandidate(cost, roi, row.clicks, row.impressions)) target.add(placement);
  }
  const targetPlacementIds = [...target].sort((a, b) => a - b);
  return {
    existingPlacementIds: existing,
    targetPlacementIds,
    addedPlacementIds: targetPlacementIds.filter((placement) => !existing.includes(placement)),
    removedPlacementIds: existing.filter((placement) => !target.has(placement)),
  };
}

export async function replaceAdsterraBlacklist(campaignId: string, rows: readonly AnalyzedPlacement[], deps: AdsterraBlacklistDependencies) {
  const existing = await deps.getBlacklist(campaignId);
  const target = buildAdsterraBlacklistTarget(existing, rows);
  if (placementSetsEqual(existing, target.targetPlacementIds)) return { status: "NO_CHANGE" as const, ...target };
  try {
    await deps.replaceBlacklist(campaignId, target.targetPlacementIds);
  } catch (error) {
    if (!(error instanceof AdsterraAmbiguousWriteError)) throw error;
    const actual = await deps.getBlacklist(campaignId);
    if (!placementSetsEqual(actual, target.targetPlacementIds)) throw new AdsterraBlacklistError("Status update Adsterra tidak dapat dipastikan dan verifikasi blacklist tidak cocok.");
    return { status: "UPDATED" as const, ...target };
  }
  const actual = await deps.getBlacklist(campaignId);
  if (!placementSetsEqual(actual, target.targetPlacementIds)) throw new AdsterraBlacklistError("Verifikasi blacklist Adsterra gagal: daftar Placement tidak cocok.");
  return { status: "UPDATED" as const, ...target };
}

type ResetDependencies = Pick<AdsterraBlacklistDependencies, "getBlacklist"> & {
  getCustomBids(campaignId: string): Promise<AdsterraCustomBid[]>;
  deleteCustomBids(campaignId: string, bids: readonly Pick<AdsterraCustomBid, "placementId" | "countryCode">[]): Promise<void>;
};
export type CustomBidResetResult = {
  status: "COMPLETE" | "PARTIAL";
  pendingPlacementIds: number[];
  message: string;
  bids: AdsterraCustomBid[] | null;
};

// Separate orchestration: existing blacklist decisions/replacement remain unchanged.
export async function replaceAdsterraBlacklistAndResetBids(
  campaignId: string, rows: readonly AnalyzedPlacement[], deps: AdsterraBlacklistDependencies & ResetDependencies,
) {
  const replacement = await replaceAdsterraBlacklist(campaignId, rows, {
    getBlacklist: async (id) => {
      try { return await deps.getBlacklist(id); }
      catch { throw new AdsterraBlacklistError("Verifikasi blacklist provider gagal; hasil perubahan belum dapat dipastikan."); }
    },
    replaceBlacklist: async (id, placements) => {
      try { await deps.replaceBlacklist(id, placements); }
      catch (error) {
        if (error instanceof AdsterraAmbiguousWriteError) throw error;
        throw new AdsterraBlacklistError(`Perubahan blacklist provider gagal. ${error instanceof AdsterraApiError ? error.message : "Periksa Adsterra sebelum mencoba lagi."}`, "PROVIDER_WRITE");
      }
    },
  });
  const customBidReset = await resetBlacklistedCustomBids(campaignId, replacement.targetPlacementIds, deps);
  return { ...replacement, customBidReset };
}

// Keep the verified provider result even if the separate metadata write fails.
// Do not change the shared wrapper's behavior for Clickadu or other consumers.
export async function runAdsterraBlacklistReplacement<T extends { status: "UPDATED" | "NO_CHANGE"; customBidReset: CustomBidResetResult }>(
  replace: () => Promise<T>, record: (at: Date) => Promise<unknown>, now: () => Date = () => new Date(),
) {
  const result = await replace(); // Provider failure is not a metadata failure.
  try {
    const recorded = await runVerifiedBlacklistReplacement(() => Promise.resolve(result), record, now);
    return { ...recorded, success: result.customBidReset.status === "COMPLETE", metadata: {
      status: result.status === "NO_CHANGE" ? "NOT_REQUIRED" as const : "RECORDED" as const, message: "",
    } };
  } catch {
    return { ...result, success: false, lastBlacklistReplacedAt: null, metadata: {
      status: "FAILED" as const, message: "Hasil provider sudah diterima, tetapi pencatatan waktu replace blacklist gagal. Status metadata belum dapat dipastikan; jangan mengulangi write provider hanya untuk memperbaiki timestamp.",
    } };
  }
}

export async function resetBlacklistedCustomBids(
  campaignId: string, placementIds: readonly number[], deps: ResetDependencies,
): Promise<CustomBidResetResult> {
  const target = normalizeForTarget(placementIds);
  const partial = (message: string, pendingPlacementIds = target, bids: AdsterraCustomBid[] | null = null): CustomBidResetResult => ({
    status: "PARTIAL", pendingPlacementIds, message, bids,
  });
  let before: AdsterraCustomBid[];
  try { before = await deps.getCustomBids(campaignId); }
  catch { return partial("Blacklist sudah diverifikasi, tetapi daftar Custom Bid gagal dimuat. Reset belum dapat dipastikan."); }
  try {
    if (!placementSetsEqual(await deps.getBlacklist(campaignId), target)) {
      return partial("Blacklist berubah selama operasi. Reset dihentikan; muat ulang sebelum melanjutkan.");
    }
  } catch { return partial("Blacklist terkini gagal diverifikasi. Reset dihentikan."); }
  const keys = before.filter((bid) => target.includes(Number(bid.placementId)))
    .map(({ placementId, countryCode }) => ({ placementId, countryCode }));
  if (keys.length) {
    // Even on timeout/error, verify via GET. Never repeat an uncertain DELETE.
    try { await deps.deleteCustomBids(campaignId, keys); } catch { /* GET below is authoritative. */ }
  }
  let actual: AdsterraCustomBid[];
  try { actual = await deps.getCustomBids(campaignId); }
  catch { return partial("Blacklist sudah diverifikasi, tetapi verifikasi reset Custom Bid gagal. Jangan mengulangi write tanpa memeriksa Adsterra."); }
  try {
    if (!placementSetsEqual(await deps.getBlacklist(campaignId), target)) {
      return partial("Blacklist berubah saat reset. Hasil akhir harus diperiksa ulang.");
    }
  } catch { return partial("Verifikasi blacklist akhir gagal. Hasil reset belum dapat dipastikan."); }
  const pending = [...new Set(actual.filter((bid) => target.includes(Number(bid.placementId))).map((bid) => Number(bid.placementId)))].sort((a, b) => a - b);
  if (pending.length) return partial("Blacklist sudah diverifikasi, tetapi sebagian Custom Bid belum berhasil direset.", pending, actual);
  return { status: "COMPLETE", pendingPlacementIds: [], message: "Custom Bid placement blacklist sudah kosong dan diverifikasi.", bids: actual };
}

function normalizeForTarget(values: readonly unknown[]) { return [...new Set(values.map(placementId))].sort((a, b) => a - b); }
function placementId(value: unknown) { const parsed = typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value.trim()) : value; if (!Number.isSafeInteger(parsed) || (parsed as number) <= 0) throw new AdsterraBlacklistError("Placement ID Adsterra tidak valid."); return parsed as number; }
function decimal(value: string) { try { const parsed = new Decimal(value); if (!parsed.isFinite()) throw new Error(); return parsed; } catch { throw new AdsterraBlacklistError("Data ROI Adsterra tidak valid."); } }
function nonNegativeDecimal(value: string) { const parsed = decimal(value); if (parsed.isNegative()) throw new AdsterraBlacklistError("Data ROI Adsterra tidak valid."); return parsed; }
