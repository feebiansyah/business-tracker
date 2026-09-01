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
