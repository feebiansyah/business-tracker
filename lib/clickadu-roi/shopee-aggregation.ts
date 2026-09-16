import Decimal from "decimal.js";

import { canonicalCommission, parseCommission } from "../shopee-import/commission.ts";
import { ShopeeImportError } from "../shopee-import/errors.ts";
import type { ClickaduShopeeCsvRow, ZoneCommissionAggregation } from "./types.ts";

export function normalizeClickaduSource(value: string) {
  return value.trim().toUpperCase();
}

export function aggregateZoneCommissions(
  rows: ClickaduShopeeCsvRow[],
  sourceTag: string,
  dateFrom: string,
  dateTill: string,
): ZoneCommissionAggregation {
  const normalizedSource = normalizeClickaduSource(sourceTag);
  if (!normalizedSource) throw new ShopeeImportError("INVALID_SOURCE_TAG", "Source Tag Clickadu tidak valid.");

  const periodRows = rows.filter((row) => row.date >= dateFrom && row.date <= dateTill);
  if (!periodRows.length) throw new ShopeeImportError("CSV_NO_ROWS_IN_PERIOD", "CSV Shopee tidak memiliki data pada periode yang dipilih.");
  const grouped = new Map<string, { commission: Decimal; rowCount: number }>();
  let processedRowCount = 0;

  for (const row of periodRows) {
    const zone = row.tagLink3.trim();
    if (normalizeClickaduSource(row.tagLink1) !== normalizedSource || !zone) continue;

    const commission = parseCommission(row.commission, row.logicalRow);
    const existing = grouped.get(zone);
    if (existing) {
      existing.commission = existing.commission.plus(commission);
      existing.rowCount += 1;
    } else {
      grouped.set(zone, { commission, rowCount: 1 });
    }
    processedRowCount += 1;
  }

  const zones = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([zone, value]) => ({
      zone,
      commission: canonicalCommission(value.commission),
      rowCount: value.rowCount,
    }));
  const totalCommission = zones.reduce(
    (total, zone) => total.plus(zone.commission),
    new Decimal(0),
  );

  return {
    zones,
    csvRowCount: rows.length,
    processedRowCount,
    ignoredRowCount: rows.length - processedRowCount,
    totalCommission: canonicalCommission(totalCommission),
  };
}
