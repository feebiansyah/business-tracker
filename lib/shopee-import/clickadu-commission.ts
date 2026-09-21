import Decimal from "decimal.js";

import { parseCommission } from "./commission.ts";
import { parseShopeeDate } from "./date.ts";
import type { ClickaduCommissionAggregate, ClickaduConfigCandidate, CsvRecord } from "./types.ts";

const normalizeSourceTag = (value: string) => value.trim().toUpperCase();

export function aggregateClickaduCommissions(
  records: readonly CsvRecord[],
  configs: readonly ClickaduConfigCandidate[],
): ClickaduCommissionAggregate[] {
  const configsBySource = new Map(configs.map((config) => [normalizeSourceTag(config.sourceTag), config]));
  const grouped = new Map<string, ClickaduCommissionAggregate>();

  for (const record of records) {
    const config = configsBySource.get(normalizeSourceTag(record.tagLink1 ?? ""));
    if (!config || !record.tagLink3?.trim()) continue;
    const date = parseShopeeDate(record.orderedAt, record.logicalRow);
    const commission = parseCommission(record.commission, record.logicalRow);
    const key = `${config.id}\u0000${date}`;
    const current = grouped.get(key);
    if (current) {
      current.commission = current.commission.plus(commission);
      current.rowCount += 1;
    } else {
      grouped.set(key, { clickaduCampaignConfigId: config.id, date, commission: new Decimal(commission), rowCount: 1 });
    }
  }

  return [...grouped.values()].sort((left, right) =>
    left.date.localeCompare(right.date) || left.clickaduCampaignConfigId - right.clickaduCampaignConfigId,
  );
}
