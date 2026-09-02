import { ShopeeImportError } from "./errors.ts";

function invalidDate(row: number): never {
  throw new ShopeeImportError("INVALID_ORDER_DATE", `Baris ${row}: Waktu Pemesanan tidak valid.`);
}

export function parseShopeeDate(value: string, row: number): string {
  const text = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  const id = /^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  const match = iso ?? id;
  if (!match) return invalidDate(row);

  const year = Number(iso ? match[1] : match[3]);
  const month = Number(match[2]);
  const day = Number(iso ? match[3] : match[1]);
  const hour = Number(match[4] ?? 0);
  const minute = Number(match[5] ?? 0);
  const second = Number(match[6] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) return invalidDate(row);

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return invalidDate(row);
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
