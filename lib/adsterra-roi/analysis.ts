import Decimal from "decimal.js";
import { canonicalCommission, parseCommission } from "../shopee-import/commission.ts";
import { ShopeeImportError } from "../shopee-import/errors.ts";
import type { AdsterraPlacementStatistic, AdsterraRoiAnalysis, AdsterraShopeeCsvRow, PlacementCommission } from "./types.ts";

const THRESHOLD = new Decimal(30);
export function normalizeAdsterraSource(value: string) { return value.trim().toUpperCase(); }
export function aggregateAdsterraCommissions(rows: AdsterraShopeeCsvRow[], sourceTag: string, dateFrom: string, dateTill: string) {
  const source = normalizeAdsterraSource(sourceTag); if (!source) throw new ShopeeImportError("INVALID_SOURCE_TAG", "Source Tag Adsterra tidak valid.");
  const periodRows = rows.filter((row) => row.date >= dateFrom && row.date <= dateTill); if (!periodRows.length) throw new ShopeeImportError("CSV_NO_ROWS_IN_PERIOD", "CSV Shopee tidak memiliki data pada periode yang dipilih.");
  const grouped = new Map<string, { commission: Decimal; rowCount: number }>();
  for (const row of periodRows) { const placement = row.tagLink3.trim(); if (normalizeAdsterraSource(row.tagLink1) !== source || !placement) continue; const amount = parseCommission(row.commission, row.logicalRow); const current = grouped.get(placement); if (current) { current.commission = current.commission.plus(amount); current.rowCount += 1; } else grouped.set(placement, { commission: amount, rowCount: 1 }); }
  return { placements: [...grouped.entries()].map(([placement, value]) => ({ placement, commission: canonicalCommission(value.commission), rowCount: value.rowCount })).sort((a, b) => a.placement.localeCompare(b.placement)) };
}
export function analyzeAdsterraRoi(statistics: AdsterraPlacementStatistic[], commissions: PlacementCommission[], fxRateValue: string): AdsterraRoiAnalysis {
  const fx = decimal(fxRateValue); if (!fx.isPositive()) throw new Error("Kurs USD ke IDR harus lebih dari 0.");
  const grouped = new Map<string, AdsterraPlacementStatistic>();
  for (const row of statistics) { const current = grouped.get(row.placement); if (current) { current.impressions += row.impressions; current.clicks += row.clicks; current.spent = decimal(current.spent).plus(row.spent).toString(); } else grouped.set(row.placement, { ...row }); }
  const commissionMap = new Map(commissions.map((row) => [row.placement, decimal(row.commission)]));
  const rows = [...grouped.values()].map((row) => { const spent = decimal(row.spent); const cost = spent.times(fx); const commission = commissionMap.get(row.placement) ?? new Decimal(0); const profit = commission.minus(cost); const roi = cost.isZero() ? null : profit.div(cost).times(100); return { ...row, spentUsd: spent.toString(), costIdr: cost.toString(), commission: commission.toString(), profit: profit.toString(), roi: roi?.toString() ?? null, isBlacklistCandidate: cost.greaterThan(0) && roi !== null && roi.lessThan(THRESHOLD) }; }).sort((a, b) => decimal(b.spentUsd).comparedTo(a.spentUsd) || a.placement.localeCompare(b.placement));
  const totals = rows.reduce((total, row) => ({ spent: total.spent.plus(row.spentUsd), cost: total.cost.plus(row.costIdr), commission: total.commission.plus(row.commission), profit: total.profit.plus(row.profit) }), { spent: new Decimal(0), cost: new Decimal(0), commission: new Decimal(0), profit: new Decimal(0) });
  return { rows, candidatePlacements: rows.filter((row) => row.isBlacklistCandidate).map((row) => row.placement), totalSpentUsd: totals.spent.toString(), totalCostIdr: totals.cost.toString(), totalCommission: totals.commission.toString(), totalProfit: totals.profit.toString(), roi: totals.cost.isZero() ? null : totals.profit.div(totals.cost).times(100).toString() };
}
function decimal(value: string) { const result = new Decimal(value); if (!result.isFinite()) throw new Error("Nilai Adsterra tidak valid."); return result; }
