import Decimal from "decimal.js";
import { ShopeeImportError } from "./errors.ts";

const DECIMAL_LIMIT = new Decimal("10000000000000000");

function invalidCommission(row: number): never {
  throw new ShopeeImportError(
    "INVALID_COMMISSION",
    `Baris ${row}: Komisi Bersih Affiliate (Rp) tidak valid.`,
  );
}

export function parseCommission(value: string, row: number): Decimal {
  const text = value.trim().replace(/^Rp\s*/i, "");
  let normalized: string;

  if (/^-?\d+$/.test(text)) {
    normalized = text;
  } else if (/^-?\d+,\d{1,5}$/.test(text)) {
    normalized = text.replace(",", ".");
  } else if (/^-?\d+\.\d{1,5}$/.test(text)) {
    normalized = text;
  } else if (/^-?\d{1,3}(?:\.\d{3}){2,}$/.test(text)) {
    normalized = text.replaceAll(".", "");
  } else if (/^-?\d{1,3}(?:\.\d{3})+,\d{1,5}$/.test(text)) {
    normalized = text.replaceAll(".", "").replace(",", ".");
  } else {
    return invalidCommission(row);
  }

  let commission: Decimal;
  try {
    commission = new Decimal(normalized);
  } catch {
    return invalidCommission(row);
  }
  if (!commission.isFinite() || commission.decimalPlaces() > 5 || commission.abs().gte(DECIMAL_LIMIT)) {
    return invalidCommission(row);
  }
  return commission;
}

export function canonicalCommission(value: Decimal) {
  return value.toFixed(5);
}
