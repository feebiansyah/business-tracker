export type AdsterraStatisticsInput = { campaignId: string; dateFrom: string; dateTill: string };
export type AdsterraPlacementStatistic = { placement: string; impressions: number; clicks: number; spent: string };
export type AdsterraShopeeCsvRow = { logicalRow: number; date: string; tagLink1: string; tagLink3: string; commission: string };
export type PlacementCommission = { placement: string; commission: string; rowCount: number };
export type AdsterraRoiRow = AdsterraPlacementStatistic & { spentUsd: string; costIdr: string; commission: string; profit: string; roi: string | null; isBlacklistCandidate: boolean };
export type AdsterraRoiAnalysis = { rows: AdsterraRoiRow[]; candidatePlacements: string[]; totalSpentUsd: string; totalCostIdr: string; totalCommission: string; totalProfit: string; roi: string | null };
