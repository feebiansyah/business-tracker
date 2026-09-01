export type CampaignMetaValues = {
  name: string;
  startTime: Date | null;
  metaStatus: string | null;
  metaAccountId: number;
};

export type MetricMetaValues = {
  spend: number | null;
  clicks: number | null;
  cpc: number | null;
};

export function campaignMetaUpdate(values: CampaignMetaValues) {
  return { ...values };
}

export function metricMetaUpdate(values: MetricMetaValues) {
  return { ...values };
}
