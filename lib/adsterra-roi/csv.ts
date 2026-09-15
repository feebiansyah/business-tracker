import { parse } from "csv-parse/sync";
import { MAX_CSV_BYTES, MAX_CSV_ROWS } from "../shopee-import/constants.ts";
import { ShopeeImportError } from "../shopee-import/errors.ts";
import { parseShopeeDate } from "../shopee-import/date.ts";
import type { AdsterraShopeeCsvRow } from "./types.ts";

const HEADERS = ["Waktu Pemesanan", "Tag_link1", "Tag_link3", "Komisi Bersih Affiliate (Rp)"] as const;
type Parsed = { record: string[]; info: { lines: number } };
export function decodeAdsterraShopeeCsv(bytes: Uint8Array): AdsterraShopeeCsvRow[] {
  if (bytes.byteLength > MAX_CSV_BYTES) throw new ShopeeImportError("CSV_TOO_LARGE", "Ukuran CSV melebihi batas 10 MiB.");
  let text: string; try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new ShopeeImportError("CSV_INVALID_ENCODING", "CSV harus menggunakan encoding UTF-8."); }
  let selected: { headers: string[]; rows: Parsed[] } | null = null;
  for (const delimiter of [",", ";"] as const) {
    try {
      const parsed = parse(text, { bom: true, delimiter, info: true, skip_empty_lines: true }) as unknown as Parsed[];
      const headers = parsed[0]?.record.map((value) => value.trim()) ?? [];
      if (HEADERS.every((header) => headers.filter((value) => value === header).length === 1)) {
        if (selected) throw new ShopeeImportError("CSV_AMBIGUOUS_DELIMITER", "Delimiter CSV ambigu.");
        selected = { headers, rows: parsed.slice(1) };
      }
    } catch (error) { if (error instanceof ShopeeImportError) throw error; }
  }
  if (!selected) throw new ShopeeImportError("CSV_INVALID_HEADERS", "Header CSV Adsterra tidak lengkap.");
  if (!selected.rows.length) throw new ShopeeImportError("CSV_EMPTY", "CSV tidak memiliki data.");
  if (selected.rows.length > MAX_CSV_ROWS) throw new ShopeeImportError("CSV_TOO_MANY_ROWS", "CSV melebihi batas 100.000 baris data.");
  const indexes = HEADERS.map((header) => selected.headers.indexOf(header));
  return selected.rows.map(({ record, info }, index) => ({ logicalRow: info.lines || index + 2, date: parseShopeeDate(record[indexes[0]] ?? "", info.lines || index + 2), tagLink1: record[indexes[1]] ?? "", tagLink3: record[indexes[2]] ?? "", commission: record[indexes[3]] ?? "" }));
}
