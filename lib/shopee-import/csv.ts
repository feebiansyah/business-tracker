import { parse } from "csv-parse/sync";
import { MAX_CSV_BYTES, MAX_CSV_ROWS, REQUIRED_HEADERS } from "./constants.ts";
import { ShopeeImportError } from "./errors.ts";
import type { CsvRecord } from "./types.ts";

type ParsedRecord = {
  record: string[];
  info: { lines: number };
};

type Candidate = {
  headers: string[];
  records: ParsedRecord[];
};

function parseCandidate(text: string, delimiter: "," | ";"): Candidate | null {
  try {
    const parsed = parse(text, {
      bom: true,
      delimiter,
      info: true,
      skip_empty_lines: true,
    }) as ParsedRecord[];

    if (parsed.length === 0) return null;
    return {
      headers: parsed[0].record.map((header) => header.trim()),
      records: parsed.slice(1),
    };
  } catch {
    return null;
  }
}

function validateHeaders(candidate: Candidate) {
  for (const required of REQUIRED_HEADERS) {
    const count = candidate.headers.filter((header) => header === required).length;
    if (count > 1) {
      return { valid: false as const, error: `Header ${required} duplikat.` };
    }
    if (count === 0) {
      return { valid: false as const, error: `Header ${required} wajib ada.` };
    }
  }
  return { valid: true as const };
}

export function decodeAndParseCsv(bytes: Uint8Array): CsvRecord[] {
  if (bytes.byteLength > MAX_CSV_BYTES) {
    throw new ShopeeImportError("CSV_TOO_LARGE", "Ukuran CSV melebihi batas 10 MiB.");
  }
  if (bytes.includes(0)) {
    throw new ShopeeImportError("CSV_NUL_BYTE", "CSV tidak boleh mengandung byte NUL.");
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ShopeeImportError("CSV_INVALID_ENCODING", "CSV harus menggunakan encoding UTF-8.");
  }

  const attempts = ([",", ";"] as const)
    .map((delimiter) => parseCandidate(text, delimiter))
    .filter((candidate): candidate is Candidate => candidate !== null)
    .map((candidate) => ({ candidate, validation: validateHeaders(candidate) }));
  const valid = attempts.filter((attempt) => attempt.validation.valid);

  if (valid.length !== 1) {
    if (valid.length > 1 || (valid.length === 0 && text.includes(",") && text.includes(";"))) {
      throw new ShopeeImportError("CSV_AMBIGUOUS_DELIMITER", "Delimiter CSV ambigu.");
    }
    const error = attempts.find((attempt) => !attempt.validation.valid)?.validation.error;
    throw new ShopeeImportError("CSV_INVALID_HEADERS", error ?? "Struktur CSV tidak valid.");
  }

  const { candidate } = valid[0];
  if (candidate.records.length === 0) {
    throw new ShopeeImportError("CSV_EMPTY", "CSV tidak memiliki data.");
  }
  if (candidate.records.length > MAX_CSV_ROWS) {
    throw new ShopeeImportError("CSV_TOO_MANY_ROWS", "CSV melebihi batas 100.000 baris data.");
  }

  const indexes = REQUIRED_HEADERS.map((header) => candidate.headers.indexOf(header));
  return candidate.records.map(({ record, info }, index) => ({
    logicalRow: info.lines || index + 2,
    orderedAt: record[indexes[0]] ?? "",
    tagLink2: record[indexes[1]] ?? "",
    commission: record[indexes[2]] ?? "",
  }));
}
