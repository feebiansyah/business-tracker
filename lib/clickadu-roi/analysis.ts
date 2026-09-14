import Decimal from "decimal.js";

import type {
  ClickaduRoiAnalysis,
  ClickaduRoiRow,
  ClickaduZoneStatistic,
  ZoneCommission,
} from "./types.ts";

const BLACKLIST_ROI_THRESHOLD = new Decimal(30);

export function analyzeClickaduRoi(
  statistics: ClickaduZoneStatistic[],
  commissions: ZoneCommission[],
  fxRateValue: string,
): ClickaduRoiAnalysis {
  const fxRate = decimal(fxRateValue, "Kurs USD ke IDR");
  if (!fxRate.isPositive()) throw new Error("Kurs USD ke IDR harus lebih dari 0.");

  const commissionByZone = new Map(
    commissions.map((row) => [row.zone, decimal(row.commission, "Komisi")]),
  );
  const rows = statistics.map((statistic): ClickaduRoiRow => {
    const spentUsd = decimal(statistic.spent, "Spend Clickadu");
    const costIdr = spentUsd.times(fxRate);
    const commission = commissionByZone.get(statistic.zone) ?? new Decimal(0);
    const profit = commission.minus(costIdr);
    const roi = costIdr.isZero() ? null : profit.dividedBy(costIdr).times(100);

    return {
      ...statistic,
      spentUsd: spentUsd.toString(),
      costIdr: costIdr.toString(),
      commission: commission.toString(),
      profit: profit.toString(),
      roi: roi?.toString() ?? null,
      isBlacklistCandidate: !costIdr.isZero() && roi !== null && roi.lessThan(BLACKLIST_ROI_THRESHOLD),
    };
  });

  rows.sort((left, right) => {
    const bySpend = decimal(right.spentUsd, "Spend Clickadu").comparedTo(
      decimal(left.spentUsd, "Spend Clickadu"),
    );
    return bySpend || left.zone.localeCompare(right.zone);
  });

  const totals = rows.reduce(
    (result, row) => ({
      spentUsd: result.spentUsd.plus(row.spentUsd),
      costIdr: result.costIdr.plus(row.costIdr),
      commission: result.commission.plus(row.commission),
      profit: result.profit.plus(row.profit),
    }),
    {
      spentUsd: new Decimal(0),
      costIdr: new Decimal(0),
      commission: new Decimal(0),
      profit: new Decimal(0),
    },
  );
  const totalRoi = totals.costIdr.isZero()
    ? null
    : totals.profit.dividedBy(totals.costIdr).times(100).toString();

  return {
    rows,
    candidateZones: rows.filter((row) => row.isBlacklistCandidate).map((row) => row.zone),
    totalSpentUsd: totals.spentUsd.toString(),
    totalCostIdr: totals.costIdr.toString(),
    totalCommission: totals.commission.toString(),
    totalProfit: totals.profit.toString(),
    roi: totalRoi,
  };
}

function decimal(value: string, label: string) {
  try {
    const parsed = new Decimal(value);
    if (!parsed.isFinite()) throw new Error("not finite");
    return parsed;
  } catch {
    throw new Error(`${label} tidak valid.`);
  }
}
