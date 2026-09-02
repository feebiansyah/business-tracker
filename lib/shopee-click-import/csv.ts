import { parse } from "csv-parse/sync";
import { MAX_CSV_BYTES, MAX_CSV_ROWS } from "../shopee-import/constants.ts";
import { parseShopeeDate } from "../shopee-import/date.ts";
import { ShopeeImportError } from "../shopee-import/errors.ts";
import type { ParsedClickCsv } from "./types.ts";

const HEADERS = ["Klik ID", "Waktu Klik", "Wilayah Klik", "Tag_link", "Perujuk"] as const;
type ParsedRecord = { record: string[]; info: { lines: number } };
type Candidate = { headers: string[]; records: ParsedRecord[] };

function candidate(text: string, delimiter: "," | ";"): Candidate | null {
  try {
    const records = parse(text, { bom: true, delimiter, info: true, skip_empty_lines: true }) as unknown as ParsedRecord[];
    if (!records.length) return null;
    return { headers: records[0].record.map((value) => value.trim()), records: records.slice(1) };
  } catch { return null; }
}

function validHeaders(value: Candidate) {
  return HEADERS.every((header) => value.headers.filter((item) => item === header).length === 1);
}

export function parseShopeeClickCsv(bytes: Uint8Array): ParsedClickCsv {
  if (bytes.byteLength > MAX_CSV_BYTES) throw new ShopeeImportError("CSV_TOO_LARGE", "Ukuran CSV melebihi batas 10 MiB.");
  if (bytes.includes(0)) throw new ShopeeImportError("CSV_NUL_BYTE", "CSV tidak boleh mengandung byte NUL.");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new ShopeeImportError("CSV_INVALID_ENCODING", "CSV harus menggunakan encoding UTF-8."); }
  const candidates = ([",", ";"] as const).map((delimiter) => candidate(text, delimiter)).filter((item): item is Candidate => item !== null);
  const valid = candidates.filter(validHeaders);
  if (valid.length !== 1) throw new ShopeeImportError("CSV_INVALID_HEADERS", "Header CSV Klik Shopee tidak valid.");
  const selected = valid[0];
  if (!selected.records.length) throw new ShopeeImportError("CSV_EMPTY", "CSV tidak memiliki data.");
  if (selected.records.length > MAX_CSV_ROWS) throw new ShopeeImportError("CSV_TOO_MANY_ROWS", "CSV melebihi batas 100.000 baris data.");
  const timeIndex = selected.headers.indexOf("Waktu Klik");
  const tagIndex = selected.headers.indexOf("Tag_link");
  const rows = [];
  let ignoredRowCount = 0;
  for (const [index, item] of selected.records.entries()) {
    const parts = (item.record[tagIndex] ?? "").trim().split("-");
    const tagLink1 = (parts[0] ?? "").trim().toUpperCase();
    const tagLink2 = (parts[1] ?? "").trim();
    if (tagLink1 !== "META" || !tagLink2) { ignoredRowCount += 1; continue; }
    rows.push({ logicalRow: item.info.lines || index + 2, date: parseShopeeDate(item.record[timeIndex] ?? "", item.info.lines || index + 2), tagLink2, normalizedTagLink2: tagLink2.trim().toUpperCase() });
  }
  if (!rows.length) throw new ShopeeImportError("CSV_NO_META_ROWS", "CSV tidak memiliki klik META yang dapat diproses.");
  return { rows, csvRowCount: selected.records.length, processedRowCount: rows.length, ignoredRowCount };
}
