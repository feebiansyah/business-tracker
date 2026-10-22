export type BalanceProvider = "CLICKADU" | "ADSTERRA";
export type BalanceKey = { shopeeAccountId: number; provider: BalanceProvider };
export type BalanceResult = BalanceKey & (
  | { status: "SUCCESS"; balance: string; currency: "USD"; updatedAt: string }
  | { status: "NOT_CONNECTED" }
  | { status: "ERROR"; message: string }
);

export function balanceKey(key: BalanceKey) {
  return `${key.shopeeAccountId}:${key.provider}`;
}
