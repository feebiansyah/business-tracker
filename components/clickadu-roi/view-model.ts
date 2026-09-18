import Decimal from "decimal.js";
import { hasMinimumDecisionCost } from "../../lib/traffic-roi/decision.ts";

export function formatIdr(value: string) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(new Decimal(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber());
}
export function formatUsd(value: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(new Decimal(value).toNumber());
}
export function formatPercent(value: string | null) {
  return value === null ? "—" : `${new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(new Decimal(value).toDecimalPlaces(2).toNumber())}%`;
}
export function candidateZoneText(zones: string[]) { return zones.join(", "); }
export function formatAnalysisDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
export function roiStatusLabel(row: { isBlacklistCandidate: boolean; profit: string; costIdr: string }) {
  if (row.isBlacklistCandidate) return "Kandidat Blacklist (ROI < 30%)";
  if (!hasMinimumDecisionCost(row.costIdr)) return "Belum Cukup Spend";
  return "Aman (ROI ≥ 30%)";
}
