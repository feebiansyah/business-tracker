export type CommissionCoverageRow = { campaignId: number; date: string };

function commissionCoverageKey(campaignId: number, date: string) {
  return `${campaignId}:${date}`;
}

export function createCommissionCoverageLookup(rows: readonly CommissionCoverageRow[]) {
  return new Set(rows.map((row) => commissionCoverageKey(row.campaignId, row.date)));
}

export function hasCommissionCoverage(lookup: ReadonlySet<string>, campaignId: number, date: string) {
  return lookup.has(commissionCoverageKey(campaignId, date));
}
