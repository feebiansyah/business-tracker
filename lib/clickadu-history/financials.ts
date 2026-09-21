import Decimal from "decimal.js";

export const CLICKADU_USD_IDR_RATE = "19000";

export function calculateClickaduDailyFinancials(spendUsd: string | null, commissionIdr: string | null) {
  if (spendUsd === null) return { spendIdr: null, profitIdr: null };
  const spendIdr = new Decimal(spendUsd).mul(CLICKADU_USD_IDR_RATE);
  return { spendIdr: spendIdr.toString(), profitIdr: commissionIdr === null ? null : new Decimal(commissionIdr).minus(spendIdr).toString() };
}
