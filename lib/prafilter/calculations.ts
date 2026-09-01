export type PrafilterCalculation = {
  costWithFee: number;
  profit: number | null;
  profitPercent: number | null;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculatePrafilterValues(spend: number | null, commission: number | null): PrafilterCalculation {
  const costWithFee = roundMoney((spend ?? 0) * 1.05);
  if (commission === null) return { costWithFee, profit: null, profitPercent: null };
  const profit = roundMoney(commission - costWithFee);
  return {
    costWithFee,
    profit,
    profitPercent: costWithFee === 0 ? null : (profit / costWithFee) * 100,
  };
}
