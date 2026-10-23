import Decimal from "decimal.js";
import type { BalanceProvider, YesterdaySpend } from "./types.ts";
import { unavailableSpend } from "./runway.ts";

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

function clickaduSpendAmount(value: unknown): Decimal {
  if (typeof value !== "string"
    || !/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) throw new Error();
  const amount = new Decimal(value.trim());
  if (!amount.isFinite() || amount.isNegative()) throw new Error();
  return amount;
}

function clickaduPageNumber(value: unknown): number {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) throw new Error();
  const page = Number(value);
  if (!Number.isSafeInteger(page) || page > 1_000) throw new Error();
  return page;
}

// Advertiser contract confirmed by the operator; the date-grouped response was
// also read from one connected account: result.items[{ date, spent }], page,
// perPage, totalPages and totals.spent. No timezone echo is required by the API.
async function requestClickaduYesterdayAccountSpend(token: string, date: string): Promise<YesterdaySpend> {
  try {
    const day = new Date(`${date}T00:00:00.000Z`);
    if (!token.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) throw new Error();
    const url = new URL("https://ssp.clickadu.com/v1.0/api/client/statistics/");
    url.searchParams.set("dateFrom", date);
    url.searchParams.set("dateTill", date);
    url.searchParams.set("groupBy", "date");
    // Bangkok and Jakarta share the same UTC+7 calendar-day boundaries.
    url.searchParams.set("timezone", "Asia/Bangkok");
    url.searchParams.set("limit", "50");
    url.searchParams.set("withTestExpenses", "1");
    // Deliberately NO campaign, status, product, material, zone or other filter:
    // spend covers the credential's whole account, including OFF and SmartCPA.
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      // Bound the entire collection, not just each page. No automatic retries.
      timer = setTimeout(() => { reject(new Error()); controller.abort(); }, 10_000);
    });
    try {
      const read = async (): Promise<YesterdaySpend> => {
        let totalPages: number | null = null;
        let total: Decimal | null = null;
        let spent: Decimal | null = null;
        for (let page = 1; page <= (totalPages ?? 1); page++) {
          controller.signal.throwIfAborted();
          url.searchParams.set("page", String(page));
          const response = await fetch(url, {
            method: "GET", cache: "no-store", redirect: "error", signal: controller.signal,
            headers: { Accept: "application/json", Authorization: token },
          });
          if (!response.ok) throw new Error();
          const result = record(record(parseExactJson(await response.text())).result);
          const reportedPages = clickaduPageNumber(result.totalPages);
          if (clickaduPageNumber(result.page) !== page || result.perPage !== "50"
            || page > reportedPages || (totalPages !== null && reportedPages !== totalPages)) throw new Error();
          totalPages = reportedPages;
          if (!Array.isArray(result.items) || result.items.length === 0 || result.items.length > 50
            || (page < totalPages && result.items.length !== 50)) throw new Error();
          const reportedTotal = clickaduSpendAmount(record(result.totals).spent);
          if (total !== null && !reportedTotal.eq(total)) throw new Error();
          total = reportedTotal;
          for (const value of result.items) {
            const row = record(value);
            // One date-only group for one day must have one unique date row.
            // Reject missing dates, summary rows and duplicates, never add them.
            if (row.date !== date || spent !== null) throw new Error();
            spent = clickaduSpendAmount(row.spent);
          }
        }
        // Totals are a completeness check, NOT a second row to add to spend.
        // Empty collections cannot prove zero; an explicit date row with 0 can.
        if (spent === null || total === null || !spent.eq(total)) throw new Error();
        return { status: "VERIFIED", date, amountUsd: spent.toString(), timezone: "Asia/Jakarta", coverage: "ACCOUNT" };
      };
      return await Promise.race([read(), timeout]);
    } finally { clearTimeout(timer); }
  } catch {
    return unavailableSpend(date, "Spend Clickadu gagal dimuat, tidak lengkap, atau tanggal/pagination/total respons tidak konsisten.");
  }
}

// Official contract: https://docs.adsterratools.com/docs/public/v3/partners-api.yml
// GET /stats.{format}: campaign/banner/landing/country are optional filters.
// Grouping only by date with NO campaign or active-status filter covers the account,
// including campaigns that are OFF now. timezone accepts GMT offsets (default UTC).
// This operation documents no page/limit/offset parameters: require the complete
// single-date collection and matching itemCount; never accept a truncated result.
// Monetary values use the account's USD denomination confirmed by the operator.
export async function requestYesterdayAccountSpend(
  provider: BalanceProvider, token: string, date: string,
): Promise<YesterdaySpend> {
  if (provider === "CLICKADU") {
    return requestClickaduYesterdayAccountSpend(token, date);
  }
  try {
    const day = new Date(`${date}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) throw new Error();
    const url = new URL("https://api3.adsterratools.com/advertiser/stats.json");
    url.searchParams.set("start_date", date);
    url.searchParams.set("finish_date", date);
    url.searchParams.append("group_by[]", "date");
    url.searchParams.set("timezone", "GMT+07:00");
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { reject(new Error()); controller.abort(); }, 10_000);
    });
    try {
      const read = async (): Promise<YesterdaySpend> => {
        const response = await fetch(url, {
          method: "GET", cache: "no-store", redirect: "error", signal: controller.signal,
          headers: { Accept: "application/json", "X-API-Key": token },
        });
        if (!response.ok) throw new Error();
        const body = record(parseExactJson(await response.text()));
        if (body.timezone !== "GMT+07:00" || !Array.isArray(body.items)
          || body.items.length !== 1 || body.itemCount !== "1") throw new Error();
        const row = record(body.items[0]);
        if (row.date !== date || typeof row.spent !== "string"
          || !/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(row.spent.trim())) throw new Error();
        const spent = new Decimal(row.spent.trim());
        if (!spent.isFinite() || spent.isNegative()) throw new Error();
        // An empty/missing date row is NOT proof of zero spend. Only explicit 0
        // in this validated complete account aggregate qualifies as verified zero.
        return { status: "VERIFIED", date, amountUsd: spent.toString(), timezone: "Asia/Jakarta", coverage: "ACCOUNT" };
      };
      return await Promise.race([read(), timeout]);
    } finally { clearTimeout(timer); }
  } catch {
    return unavailableSpend(date, "Spend Adsterra gagal dimuat, tidak lengkap, atau tanggal/timezone respons tidak sesuai WIB.");
  }
}
