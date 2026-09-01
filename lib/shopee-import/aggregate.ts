import Decimal from "decimal.js";
import { parseCommission } from "./commission.ts";
import { parseShopeeDate } from "./date.ts";
import { ShopeeImportError } from "./errors.ts";
import { normalizeTag } from "./tags.ts";
import type { AggregationResult, CommissionAggregate, CsvRecord } from "./types.ts";

export function aggregateCommissionRows(records: CsvRecord[]): AggregationResult {
  if (records.length === 0) {
    throw new ShopeeImportError("CSV_EMPTY", "CSV tidak memiliki data.");
  }

  const grouped = new Map<string, CommissionAggregate>();
  const tags = new Set<string>();
  let dateFrom = "";
  let dateTo = "";
  let totalCommission = new Decimal(0);

  for (const record of records) {
    const date = parseShopeeDate(record.orderedAt, record.logicalRow);
    const tag = normalizeTag(record.tagLink2, record.logicalRow);
    const commission = parseCommission(record.commission, record.logicalRow);
    const key = `${date}\u0000${tag.normalized}`;
    const existing = grouped.get(key);

    if (existing) {
      existing.commission = existing.commission.plus(commission);
      existing.rowCount += 1;
    } else {
      grouped.set(key, {
        date,
        tagLink2: tag.display,
        normalizedTagLink2: tag.normalized,
        commission,
        rowCount: 1,
      });
    }

    tags.add(tag.normalized);
    totalCommission = totalCommission.plus(commission);
    if (!dateFrom || date < dateFrom) dateFrom = date;
    if (!dateTo || date > dateTo) dateTo = date;
  }

  const aggregates = [...grouped.values()].sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.normalizedTagLink2.localeCompare(right.normalizedTagLink2),
  );

  return {
    aggregates,
    csvRowCount: records.length,
    tagCount: tags.size,
    dateFrom,
    dateTo,
    totalCommission,
  };
}
