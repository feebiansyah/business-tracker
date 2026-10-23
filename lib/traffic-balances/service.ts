import { balanceKey, type BalanceKey, type BalanceProvider, type BalanceResult, type YesterdaySpend } from "./types.ts";
import { calculateTrafficRunway, unavailableSpend, yesterdayJakarta } from "./runway.ts";

type Dependencies = {
  loadAccounts(ids: number[]): Promise<{ id: number }[]>;
  loadCredential(id: number, provider: BalanceProvider): Promise<{
    shopeeAccountId: number; provider: string; encryptedSecret: string;
  } | null>;
  decrypt(secret: string): string;
  requestBalance(provider: BalanceProvider, token: string): Promise<string>;
  requestYesterdaySpend(provider: BalanceProvider, token: string, date: string): Promise<YesterdaySpend>;
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
  const spendDate = yesterdayJakarta(deps.now?.() ?? new Date());
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
        const token = deps.decrypt(credential.encryptedSecret);
        const balance = await deps.requestBalance(key.provider, token);
        const updatedAt = (deps.now?.() ?? new Date()).toISOString();
        let spend: YesterdaySpend;
        // Sequential reads inside each of four workers cap ALL provider HTTP
        // requests (balance + spend) at four, not four per request category.
        try { spend = await deps.requestYesterdaySpend(key.provider, token, spendDate); }
        catch { spend = unavailableSpend(spendDate, "Pengambilan spend kemarin gagal."); }
        results[index] = {
          ...key, status: "SUCCESS", balance, currency: "USD", updatedAt,
          runway: calculateTrafficRunway(balance, spend, spendDate),
        };
      } catch {
        results[index] = { ...key, status: "ERROR", message: "Saldo gagal dimuat. Silakan coba refresh kembali." };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, keys.length) }, () => worker()));
  // Validate the entire batch at publication, including pairs finished before
  // midnight while another account's request was still pending.
  const currentSpendDate = yesterdayJakarta(deps.now?.() ?? new Date());
  if (currentSpendDate !== spendDate) {
    for (const result of results) {
      if (result.status === "SUCCESS") result.runway = calculateTrafficRunway(result.balance,
        unavailableSpend(currentSpendDate, "Tanggal WIB berubah selama refresh. Silakan refresh kembali."), currentSpendDate);
    }
  }
  return results;
}
