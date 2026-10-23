export type BalanceProvider = "CLICKADU" | "ADSTERRA";
export type BalanceKey = { shopeeAccountId: number; provider: BalanceProvider };
export type YesterdaySpend =
  | { status: "VERIFIED"; date: string; amountUsd: string; timezone: "Asia/Jakarta"; coverage: "ACCOUNT" }
  | { status: "UNAVAILABLE"; date: string; message: string };
export type TrafficRunway =
  | { status: "ESTIMATED"; spendDate: string; spendUsd: string; days: string; low: boolean }
  | { status: "NO_SPEND"; spendDate: string; spendUsd: "0" }
  | { status: "EXHAUSTED"; spendDate: string; spendUsd: string | null }
  | { status: "UNAVAILABLE"; spendDate: string; spendUsd: null; message: string };
export type BalanceResult = BalanceKey & (
  | { status: "SUCCESS"; balance: string; currency: "USD"; updatedAt: string; runway: TrafficRunway }
  | { status: "NOT_CONNECTED" }
  | { status: "ERROR"; message: string }
);

export function balanceKey(key: BalanceKey) {
  return `${key.shopeeAccountId}:${key.provider}`;
}
