import Decimal from "decimal.js";
import { formatPercent } from "../clickadu-roi/view-model.ts";

export function formatPlacementCtr(clicks: number, impressions: number) {
  if (impressions === 0) return "N/A";
  return formatPercent(new Decimal(clicks).div(impressions).times(100).toString());
}

/** Effective CPM in USD for the selected analysis period, not the configured bid. */
export function formatPlacementCpm(spentUsd: string, impressions: number) {
  if (!Number.isSafeInteger(impressions) || impressions <= 0) return "N/A";
  const spent = new Decimal(spentUsd);
  if (!spent.isFinite() || spent.isNegative()) return "N/A";
  return `$${spent.times(1000).div(impressions).toFixed(4)}`;
}
