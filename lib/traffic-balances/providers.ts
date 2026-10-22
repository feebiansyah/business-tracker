import Decimal from "decimal.js";
import type { BalanceProvider } from "./types.ts";

const endpoints = {
  CLICKADU: "https://ssp.clickadu.com/api/v2/client/balance/",
  ADSTERRA: "https://api3.adsterratools.com/advertiser/balance.json",
} as const;

class BalanceReadError extends Error {}

// Preserve numeric JSON lexemes before JSON.parse can round them to binary floats.
// Quoted strings (including escaped quotes) are left untouched.
function parseExactJson(text: string): unknown {
  // Validate the original grammar first: quoting numeric tokens must not repair
  // malformed input such as an unquoted numeric object property.
  JSON.parse(text);
  return JSON.parse(text.replace(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, (token) => {
    if (token.startsWith('"')) return token;
    if (!Number.isFinite(Number(token))) throw new BalanceReadError("Respons saldo tidak valid.");
    return JSON.stringify(token);
  }));
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BalanceReadError("Respons saldo tidak valid.");
  return value as Record<string, unknown>;
}

function parseBalance(provider: BalanceProvider, body: unknown): string {
  const root = record(body);
  const value = provider === "CLICKADU"
    ? record(record(root.result).advertiser).balance
    : root.item;
  if (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) {
    throw new BalanceReadError("Respons saldo tidak valid.");
  }
  const amount = new Decimal(value.trim());
  if (!amount.isFinite()) throw new BalanceReadError("Respons saldo tidak valid.");
  return amount.toString();
}

export async function requestTrafficBalance(
  provider: BalanceProvider, token: string,
  { fetchImpl = fetch, timeoutMs = 10_000 }: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<string> {
  if (!(provider in endpoints) || !token.trim()) throw new BalanceReadError("Koneksi saldo tidak valid.");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new BalanceReadError("Batas waktu pengambilan saldo terlampaui."));
      controller.abort();
    }, timeoutMs);
  });
  try {
    const read = async () => {
      const response = await fetchImpl(endpoints[provider], {
        method: "GET", cache: "no-store", redirect: "error", signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(provider === "CLICKADU" ? { Authorization: token } : { "X-API-Key": token }),
        },
      });
      if (!response.ok) throw new BalanceReadError(`Saldo gagal dimuat (HTTP ${response.status}).`);
      return parseBalance(provider, parseExactJson(await response.text()));
    };
    return await Promise.race([read(), timeout]);
  } catch (error) {
    if (error instanceof BalanceReadError) throw error;
    // Never return raw provider bodies, request URLs, credentials or network errors.
    throw new BalanceReadError("Saldo gagal dimuat atau respons provider tidak valid.");
  } finally {
    clearTimeout(timer);
  }
}
