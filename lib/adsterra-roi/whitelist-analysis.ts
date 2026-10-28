import Decimal from "decimal.js";
import { hasMinimumDecisionCost } from "../traffic-roi/decision";
import type { AdsterraRoiRow } from "./types";

export type AdsterraAnalysisListKind = "BLACKLIST" | "WHITELIST";
export type AdsterraWhitelistStatus = "CANDIDATE" | "NOT_CANDIDATE" | "INSUFFICIENT_SPEND" | "UNKNOWN";
type Placement = Pick<AdsterraRoiRow, "placement" | "costIdr" | "roi" | "clicks" | "impressions">;

/** Positive eligibility, deliberately not the inverse of isBlacklistCandidate. */
export function classifyAdsterraWhitelist(row: Placement): AdsterraWhitelistStatus {
  try {
    if (typeof row.costIdr !== "string" || !row.costIdr.trim()) return "UNKNOWN";
    const cost = new Decimal(row.costIdr);
    if (!cost.isFinite() || cost.isNegative()) return "UNKNOWN";
    if (!hasMinimumDecisionCost(cost)) return "INSUFFICIENT_SPEND";
    // Match existing numeric provider-ID validation while retaining the row ID
    // (including supported leading zeros) for display/CSV identity and copying.
    if (typeof row.roi !== "string" || !row.roi.trim() || typeof row.placement !== "string"
      || !/^\d+$/.test(row.placement) || !Number.isSafeInteger(Number(row.placement)) || Number(row.placement) <= 0) return "UNKNOWN";
    const roi = new Decimal(row.roi);
    if (!roi.isFinite() || ![row.clicks, row.impressions].every((value) => Number.isSafeInteger(value) && value >= 0)) return "UNKNOWN";
    // CTR unavailable because of valid zero impressions is not invalid data.
    if (roi.greaterThanOrEqualTo(20)) return "CANDIDATE";
    if (row.impressions === 0) return "NOT_CANDIDATE";
    const ctr = new Decimal(row.clicks).div(row.impressions).times(100);
    return roi.greaterThan(10) && ctr.greaterThan(8) ? "CANDIDATE" : "NOT_CANDIDATE";
  } catch { return "UNKNOWN"; }
}

export function adsterraWhitelistCandidates(rows: readonly Placement[]): string[] {
  return [...new Set(rows.filter((row) => classifyAdsterraWhitelist(row) === "CANDIDATE").map((row) => row.placement))];
}
