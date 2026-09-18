import Decimal from "decimal.js";

import { AdsterraAmbiguousWriteError } from "./client.ts";
import type { AdsterraRoiRow } from "./types.ts";
import { BLACKLIST_ROI_THRESHOLD, hasMinimumDecisionCost } from "../traffic-roi/decision.ts";

type AnalyzedPlacement = Pick<AdsterraRoiRow, "placement" | "costIdr" | "roi">;

export class AdsterraBlacklistError extends Error {
  constructor(message: string) { super(message); this.name = "AdsterraBlacklistError"; }
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
    const isLoss = row.roi !== null && decimal(row.roi).lessThan(BLACKLIST_ROI_THRESHOLD);
    if (isLoss) target.add(placement);
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

function normalizeForTarget(values: readonly unknown[]) { return [...new Set(values.map(placementId))].sort((a, b) => a - b); }
function placementId(value: unknown) { const parsed = typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value.trim()) : value; if (!Number.isSafeInteger(parsed) || (parsed as number) <= 0) throw new AdsterraBlacklistError("Placement ID Adsterra tidak valid."); return parsed as number; }
function decimal(value: string) { try { const parsed = new Decimal(value); if (!parsed.isFinite()) throw new Error(); return parsed; } catch { throw new AdsterraBlacklistError("Data ROI Adsterra tidak valid."); } }
function nonNegativeDecimal(value: string) { const parsed = decimal(value); if (parsed.isNegative()) throw new AdsterraBlacklistError("Data ROI Adsterra tidak valid."); return parsed; }
