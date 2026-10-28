import type { BudgetValue } from "./budget-types";

// Official Marketing API currencies table: IDR has offset 1 (not 100).
// https://developers.facebook.com/docs/marketing-api/currencies/
export const IDR_OFFSET = BigInt(1);
const maximum = BigInt("9007199254740991");

export function parseBudgetValue(value: unknown): BudgetValue {
  if (value === undefined) return { state: "MISSING" };
  if (value === null) return { state: "NULL" };
  const raw = typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? String(value) : value;
  if (typeof raw !== "string" || !/^\d+$/.test(raw) || raw.length > 16 || BigInt(raw) > maximum) return { state: "INVALID" };
  return { state: "VALUE", value: BigInt(raw).toString() };
}

/** Explicit Indonesian input grammar; no floating point, decimals or locale guessing. */
export function parseIdrInput(value: unknown): string {
  if (typeof value !== "string" || value.length > 64) throw new Error("Nominal rupiah tidak valid.");
  const raw = value.trim().replace(/^Rp\s?/, "");
  if (!/^(?:[1-9]\d*|[1-9]\d{0,2}(?:\.\d{3})+)$/.test(raw)) throw new Error("Masukkan rupiah bulat positif, misalnya 500000 atau Rp500.000. Pecahan, koma dan eksponen tidak diterima.");
  const digits = raw.replaceAll(".", "");
  if (digits.length > 16 || BigInt(digits) > maximum) throw new Error("Nominal melebihi batas bilangan bulat aman.");
  return (BigInt(digits) * IDR_OFFSET).toString();
}

export function formatIdrBudget(value: string): string {
  const parsed = parseBudgetValue(value);
  return parsed.state === "VALUE" ? `Rp${parsed.value.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}` : "Tidak tersedia";
}

export function showBudgetValue(value: BudgetValue, currency: string | null) {
  if (value.state !== "VALUE") return ({ MISSING: "Field tidak tersedia", NULL: "Nilai null", INVALID: "Nilai tidak valid" })[value.state];
  return currency === "IDR" ? formatIdrBudget(value.value) : `${value.value} unit API (${currency ?? "mata uang belum terbukti"})`;
}
