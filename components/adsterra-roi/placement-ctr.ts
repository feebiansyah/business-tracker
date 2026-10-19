import Decimal from "decimal.js";
import { formatPercent } from "../clickadu-roi/view-model.ts";

export function formatPlacementCtr(clicks: number, impressions: number) {
  if (impressions === 0) return "N/A";
  return formatPercent(new Decimal(clicks).div(impressions).times(100).toString());
}
