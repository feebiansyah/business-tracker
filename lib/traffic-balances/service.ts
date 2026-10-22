import { balanceKey, type BalanceKey, type BalanceProvider, type BalanceResult } from "./types.ts";

type Dependencies = {
  loadAccounts(ids: number[]): Promise<{ id: number }[]>;
  loadCredential(id: number, provider: BalanceProvider): Promise<{
    shopeeAccountId: number; provider: string; encryptedSecret: string;
  } | null>;
  decrypt(secret: string): string;
  requestBalance(provider: BalanceProvider, token: string): Promise<string>;
  now?: () => Date;
};

function parseKeys(input: unknown): BalanceKey[] {
  if (!Array.isArray(input) || input.length > 1000) throw new Error("Permintaan saldo tidak valid.");
  const unique = new Map<string, BalanceKey>();
  for (const value of input) {
    if (!value || typeof value !== "object" || !Number.isSafeInteger(value.shopeeAccountId) || value.shopeeAccountId <= 0
      || !["CLICKADU", "ADSTERRA"].includes(value.provider)) throw new Error("Permintaan saldo tidak valid.");
    const key: BalanceKey = { shopeeAccountId: value.shopeeAccountId, provider: value.provider };
    unique.set(balanceKey(key), key);
  }
  return [...unique.values()];
}

export async function loadTrafficBalances(input: unknown, deps: Dependencies): Promise<BalanceResult[]> {
  const keys = parseKeys(input);
  if (keys.length === 0) return [];
  const accounts = new Set((await deps.loadAccounts([...new Set(keys.map((key) => key.shopeeAccountId))])).map((account) => account.id));
  const results: BalanceResult[] = new Array(keys.length);
  let cursor = 0;
  async function worker() {
    while (cursor < keys.length) {
      const index = cursor++;
      const key = keys[index];
      try {
        if (!accounts.has(key.shopeeAccountId)) throw new Error("Unknown account");
        const credential = await deps.loadCredential(key.shopeeAccountId, key.provider);
        if (!credential) { results[index] = { ...key, status: "NOT_CONNECTED" }; continue; }
        if (credential.shopeeAccountId !== key.shopeeAccountId || credential.provider !== key.provider) throw new Error("Credential scope mismatch");
        const balance = await deps.requestBalance(key.provider, deps.decrypt(credential.encryptedSecret));
        results[index] = { ...key, status: "SUCCESS", balance, currency: "USD", updatedAt: (deps.now?.() ?? new Date()).toISOString() };
      } catch {
        results[index] = { ...key, status: "ERROR", message: "Saldo gagal dimuat. Silakan coba refresh kembali." };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, keys.length) }, () => worker()));
  return results;
}
