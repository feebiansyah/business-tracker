import Decimal from "decimal.js";
import type { TrafficRunway, YesterdaySpend } from "./types.ts";

// Calendar arithmetic in Jakarta, not a rolling 24-hour reporting window.
export function yesterdayJakarta(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)!.value;
  const date = new Date(`${part("year")}-${part("month")}-${part("day")}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function unavailableSpend(date: string, message: string): YesterdaySpend {
  return { status: "UNAVAILABLE", date, message };
}

export function calculateTrafficRunway(balanceUsd: string, spend: YesterdaySpend, date: string): TrafficRunway {
  const unavailable: TrafficRunway = {
    status: "UNAVAILABLE", spendDate: date, spendUsd: null,
    message: spend.status === "UNAVAILABLE" ? spend.message : "Spend seluruh akun untuk kemarin WIB belum dapat diverifikasi.",
  };
  try {
    const balance = new Decimal(balanceUsd);
    if (!balance.isFinite()) return unavailable;
    const verified = spend.status === "VERIFIED" && spend.date === date
      && spend.timezone === "Asia/Jakarta" && spend.coverage === "ACCOUNT";
    let amount: Decimal | null = null;
    try { amount = verified ? new Decimal(spend.amountUsd) : null; }
    catch { /* Invalid spend must not hide an exhausted balance. */ }
    if (balance.lte(0)) return {
      status: "EXHAUSTED", spendDate: date,
      spendUsd: amount !== null && amount.isFinite() && !amount.isNegative() ? amount.toString() : null,
    };
    if (amount === null || !amount.isFinite() || amount.isNegative()) return unavailable;
    if (amount.isZero()) return { status: "NO_SPEND", spendDate: date, spendUsd: "0" };
    // Preserve the threshold comparison even for values with many decimal digits.
    const Exact = Decimal.clone({ precision: Math.max(40, balance.sd(), amount.sd()) + 2 });
    return {
      status: "ESTIMATED", spendDate: date, spendUsd: amount.toString(),
      days: new Exact(balance).div(amount).toString(),
      low: balance.lte(new Exact(amount).times(2)),
    };
  } catch { return unavailable; }
}

export function formatRunwayDays(days: string): string {
  return `±${new Decimal(days).toFixed(1, Decimal.ROUND_HALF_UP).replace(".", ",")} hari`;
}

export function runwayTitle(runway: TrafficRunway): string {
  const amount = runway.spendUsd === null ? "belum terverifikasi" : `${runway.spendUsd} USD`;
  const explanation = runway.status === "UNAVAILABLE" ? ` ${runway.message}` : "";
  return `Tanggal spend: ${runway.spendDate} (Asia/Jakarta/WIB). Spend kemarin seluruh akun: ${amount}. Perkiraan jika laju pengeluaran sama dengan kemarin.${explanation}`;
}
