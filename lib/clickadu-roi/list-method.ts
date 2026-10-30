import Decimal from "decimal.js";
import { BLACKLIST_ROI_THRESHOLD, hasMinimumDecisionCost } from "../traffic-roi/decision";
import type { ClickaduRoiAnalysis } from "./types";

export type ClickaduListMethod = "BLACKLIST" | "WHITELIST";
export type ClickaduListState = { method: ClickaduListMethod; zoneIds: string[] };
export type ClickaduListPreview = {
  configId: number; campaignId: string; label: string; previousMethod: ClickaduListMethod;
  method: ClickaduListMethod; previousCount: number; target: string[]; precondition: string;
};

export function parseListMethod(value: unknown): ClickaduListMethod {
  if (value !== "BLACKLIST" && value !== "WHITELIST") throw new Error("Metode Clickadu tidak valid.");
  return value;
}
export function clickaduListCandidates(analysis: ClickaduRoiAnalysis, method: ClickaduListMethod) {
  if (method === "BLACKLIST") return analysis.candidateZones;
  return analysis.rows.filter((row) => {
    if (row.roi === null) return false;
    try {
      const roi = new Decimal(row.roi), cost = new Decimal(row.costIdr);
      return cost.isFinite() && roi.isFinite() && hasMinimumDecisionCost(cost) && roi.greaterThanOrEqualTo(BLACKLIST_ROI_THRESHOLD);
    } catch { return false; }
  }).map((row) => row.zone);
}
