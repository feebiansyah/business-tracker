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
