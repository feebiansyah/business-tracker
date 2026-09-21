import Decimal from "decimal.js";
export const ADSTERRA_USD_IDR_RATE = "19000";
export function calculateAdsterraDailyFinancials(spendUsd: string | null, commissionIdr: string | null) { if (spendUsd === null) return { spendIdr: null, profitIdr: null }; const spendIdr = new Decimal(spendUsd).mul(ADSTERRA_USD_IDR_RATE); return { spendIdr: spendIdr.toString(), profitIdr: commissionIdr === null ? null : new Decimal(commissionIdr).minus(spendIdr).toString() }; }
