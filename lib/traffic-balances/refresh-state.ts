import Decimal from "decimal.js";
import { balanceKey, type BalanceKey, type BalanceResult, type TrafficRunway } from "./types.ts";

export type BalanceState = {
  status: "LOADING" | "SUCCESS" | "NOT_CONNECTED" | "ERROR";
  requestId: number;
  balance: string | null;
  updatedAt: string | null;
  message: string;
  runway: TrafficRunway | null;
};
type Snapshot = Record<string, BalanceState>;
export type BalanceLoader = (keys: BalanceKey[]) => Promise<BalanceResult[]>;

export function completeBalanceRefresh(previous: BalanceState, requestId: number, result: BalanceResult): BalanceState {
  if (previous.requestId !== requestId) return previous;
  if (result.status === "SUCCESS") return { requestId, status: "SUCCESS", balance: result.balance, updatedAt: result.updatedAt, message: "", runway: result.runway ?? null };
  if (result.status === "NOT_CONNECTED") return { requestId, status: "NOT_CONNECTED", balance: null, updatedAt: null, message: "", runway: null };
  return { ...previous, status: "ERROR", message: result.message, runway: null };
}

// Page-lifetime store only: no persistence, no timer/polling, no shared balance cache.
export function createBalanceStore(load: BalanceLoader) {
  let snapshot: Snapshot = {};
  let sequence = 0;
  const listeners = new Set<() => void>();
  const busy = new Set<string>();
  function publish() { for (const listener of listeners) listener(); }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async refresh(requested: BalanceKey[]) {
      const keys = [...new Map(requested.map((key) => [balanceKey(key), key])).values()].filter((key) => !busy.has(balanceKey(key)));
      if (!keys.length) return;
      const requestId = ++sequence;
      const next = { ...snapshot };
      for (const key of keys) {
        const id = balanceKey(key);
        busy.add(id);
        next[id] = { balance: snapshot[id]?.balance ?? null, updatedAt: snapshot[id]?.updatedAt ?? null, requestId, status: "LOADING", message: "", runway: null };
      }
      snapshot = next; publish();
      let results: BalanceResult[];
      try { results = await load(keys); } catch { results = []; }
      const byKey = new Map(results.map((result) => [balanceKey(result), result]));
      const completed = { ...snapshot };
      for (const key of keys) {
        const id = balanceKey(key);
        const result: BalanceResult = byKey.get(id) ?? { ...key, status: "ERROR", message: "Saldo gagal dimuat. Silakan coba refresh kembali." };
        completed[id] = completeBalanceRefresh(completed[id], requestId, result);
        busy.delete(id);
      }
      snapshot = completed; publish();
    },
  };
}

export function formatBalanceUsd(balance: string) {
  const amount = new Decimal(balance).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const [integer, fraction] = amount.toFixed(2).split(".");
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${fraction} USD`;
}

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
export function formatBalanceTime(value: string) {
  return `${dateFormatter.format(new Date(value))} WIB`;
}
