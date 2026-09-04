export type DashboardFinancials = { budget: number | null; costWithFee: number | null; commission: number | null; profit: number | null; profitPercent: number | null };

export function calculateDashboardFinancials(budget: number | null, commission: number | null): DashboardFinancials {
  const costWithFee = budget === null ? null : budget * 1.05;
  const profit = costWithFee === null || commission === null ? null : commission - costWithFee;
  return { budget, costWithFee, commission, profit, profitPercent: profit === null || costWithFee === null || costWithFee === 0 ? null : profit / costWithFee * 100 };
}

export function summarizeDashboardDays(days: readonly DashboardFinancials[]): DashboardFinancials {
  if (days.length === 0) return calculateDashboardFinancials(null, null);
  const budget = days.every((day) => day.budget !== null) ? days.reduce((sum, day) => sum + day.budget!, 0) : null;
  const commission = days.every((day) => day.commission !== null) ? days.reduce((sum, day) => sum + day.commission!, 0) : null;
  return calculateDashboardFinancials(budget, commission);
}
