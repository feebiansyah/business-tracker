export type ClickaduStatisticsInput = {
  campaignIds: string[];
  dateFrom: string;
  dateTill: string;
};
export type ClickaduZoneStatistic = {
  impressions: number;
  clicks: number;
  conversions: number;
  conversionsClicks: number;
  cpa: string;
  cpc: string;
  cpm: string;
  ctr: string;
  cr: string;
  spent: string;
  zone: string;
};

export type ClickaduShopeeCsvRow = {
  logicalRow: number;
  tagLink1: string;
  tagLink3: string;
  commission: string;
};

export type ZoneCommission = {
  zone: string;
  commission: string;
  rowCount: number;
};

export type ZoneCommissionAggregation = {
  zones: ZoneCommission[];
  csvRowCount: number;
  processedRowCount: number;
  ignoredRowCount: number;
  totalCommission: string;
};

export type ClickaduRoiRow = ClickaduZoneStatistic & {
  spentUsd: string;
  costIdr: string;
  commission: string;
  profit: string;
  roi: string | null;
  isBlacklistCandidate: boolean;
};

export type ClickaduRoiAnalysis = {
  rows: ClickaduRoiRow[];
  candidateZones: string[];
  totalSpentUsd: string;
  totalCostIdr: string;
  totalCommission: string;
  totalProfit: string;
  roi: string | null;
};
