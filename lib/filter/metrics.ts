export function calculateFinancialMetrics(spend: number, commission: number | null, clickFp: number | null, shopeeClicks: number | null) {
  const costWithFee = spend * 1.05;
  const profit = commission === null ? null : commission - costWithFee;
  return {
    costWithFee,
    profit,
    profitPercent: profit === null || costWithFee === 0 ? null : (profit / costWithFee) * 100,
    clickPercent: shopeeClicks === null || !clickFp ? null : (shopeeClicks / clickFp) * 100,
    cpcShopee: shopeeClicks === null || shopeeClicks === 0 ? null : spend / shopeeClicks,
  };
}

export function dailyMetricMetaUpdate(row: { spend: string | null; clickFp: number | null; cpcFp: string | null }) {
  return { spend: row.spend, clickFp: row.clickFp, cpcFp: row.cpcFp };
}

function optionalInteger(value: string | undefined) {
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function metaFieldsFromInsight(row: { spend?: string; inline_link_clicks?: string; cost_per_inline_link_click?: string }) {
  return dailyMetricMetaUpdate({
    spend: row.spend ?? null,
    clickFp: optionalInteger(row.inline_link_clicks),
    cpcFp: row.cost_per_inline_link_click ?? null,
  });
}
