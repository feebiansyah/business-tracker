import Decimal from "decimal.js";

export type StatusSortOrder = "safe-first" | "blacklist-first" | "insufficient-first";
export type SortCriterion = { key: string; direction: "asc" | "desc"; statusOrder?: StatusSortOrder };
export type SortValue = Decimal | string | null;
export type SortColumn<Row> = { key: string; label: string; value(row: Row): SortValue };

export const DEFAULT_ANALYSIS_SORT: readonly SortCriterion[] = [{ key: "spentUsd", direction: "desc" }];

// Existing table classifications: 0 = candidate, 1 = safe, 2 = insufficient spend.
// These are display ranks only; no ROI/CTR decision is recalculated here.
export const STATUS_SORT_OPTIONS = [
  { value: "safe-first", label: "Aman di atas", description: "Aman → Kandidat Blacklist → Belum Cukup Spend", ranks: [1, 0, 2] },
  { value: "blacklist-first", label: "Kandidat Blacklist di atas", description: "Kandidat Blacklist → Aman → Belum Cukup Spend", ranks: [0, 1, 2] },
  { value: "insufficient-first", label: "Belum Cukup Spend di atas", description: "Belum Cukup Spend → Kandidat Blacklist → Aman", ranks: [1, 2, 0] },
] as const;

export function statusSortOption(value?: string) {
  return STATUS_SORT_OPTIONS.find((option) => option.value === value) ?? STATUS_SORT_OPTIONS[1];
}

export function decimalSortValue(value: string | number | null | undefined): Decimal | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = new Decimal(value);
  return parsed.isFinite() ? parsed : null;
}

export function identifierSortValue(value: string): Decimal | string {
  return /^\d+$/.test(value) ? new Decimal(value) : value;
}

export function ratioSortValue(numerator: string | number, denominator: number, multiplier: number): Decimal | null {
  const value = decimalSortValue(numerator);
  if (!value || !Number.isFinite(denominator) || denominator <= 0) return null;
  return value.div(denominator).times(multiplier);
}

/** Prepare expensive values once per data snapshot, never inside the comparator. */
export function prepareSortRows<Row>(rows: readonly Row[], columns: readonly SortColumn<Row>[]) {
  return rows.map((row, index) => ({ row, index, values: new Map(columns.map((column) => [column.key, column.value(row)])) }));
}

const identifierCollator = new Intl.Collator("en", { numeric: true });

export function sortPreparedRows<Row>(prepared: ReturnType<typeof prepareSortRows<Row>>, criteria: readonly SortCriterion[]) {
  return [...prepared].sort((left, right) => {
    for (const { key, direction, statusOrder } of criteria) {
      const a = left.values.get(key) ?? null;
      const b = right.values.get(key) ?? null;
      // Missing values are last in BOTH directions, not zero or a signed sentinel.
      if (a === null || b === null) {
        if (a !== b) return a === null ? 1 : -1;
        continue;
      }
      if (key === "status" && a instanceof Decimal && b instanceof Decimal) {
        const { ranks } = statusSortOption(statusOrder);
        // Only the fixed classification codes (0/1/2) become numbers, never money.
        const compared = ranks[a.toNumber()] - ranks[b.toNumber()];
        if (compared) return compared;
        continue;
      }
      const compared = a instanceof Decimal && b instanceof Decimal
        ? a.comparedTo(b)
        : a instanceof Decimal ? -1 : b instanceof Decimal ? 1 : identifierCollator.compare(a, b);
      if (compared) return direction === "asc" ? compared : -compared;
    }
    return left.index - right.index;
  }).map(({ row }) => row);
}

export function nextHeaderSort(criteria: readonly SortCriterion[], key: string, additive: boolean): SortCriterion[] {
  const current = criteria.find((item) => item.key === key);
  const next: SortCriterion = { key, direction: current?.direction === "asc" ? "desc" : "asc" };
  if (!additive) return [next];
  return current ? criteria.map((item) => item.key === key ? next : item) : [...criteria, next];
}
