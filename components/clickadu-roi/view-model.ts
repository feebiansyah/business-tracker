import Decimal from "decimal.js";

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
export function roiStatusLabel(row: { isBlacklistCandidate: boolean; profit: string; costIdr: string }) {
  if (row.isBlacklistCandidate) return "Kandidat Blacklist";
  if (new Decimal(row.costIdr).isZero()) return "Tanpa Biaya";
  return new Decimal(row.profit).isNegative() ? "Loss" : "Profitable";
}
