import Decimal from "decimal.js";
import { hasMinimumDecisionCost } from "../traffic-roi/decision.ts";

export function isAdsterraBlacklistCandidate(costIdr: Decimal.Value, roi: Decimal.Value | null, clicks: number, impressions: number) {
  if (!hasMinimumDecisionCost(costIdr) || roi === null) return false;
  const ctr = impressions === 0 ? null : new Decimal(clicks).div(impressions).times(100);
  const safe = new Decimal(roi).greaterThan(10) && ctr !== null && ctr.greaterThan(8);
  return !safe;
}
