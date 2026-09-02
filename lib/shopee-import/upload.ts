import { ShopeeImportError } from "./errors.ts";
import { MAX_CSV_BYTES } from "./constants.ts";
import type { CsvUpload } from "./types.ts";

const ACCEPTED_CSV_MIME_TYPES = new Set(["", "text/csv", "application/vnd.ms-excel"]);

export function validateShopeeAccountId(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new ShopeeImportError("INVALID_SHOPEE_ACCOUNT", "Akun Shopee tidak valid.");
  }
}

export function sanitizeFilename(value: string) {
  const basename = value.replaceAll("\\", "/").split("/").at(-1)?.replace(/[\x00-\x1f\x7f]/g, "").trim();
  if (!basename) {
    throw new ShopeeImportError("INVALID_FILENAME", "Nama file CSV tidak valid.");
  }
  if (basename.length <= 255) return basename;

  const extension = basename.toLowerCase().endsWith(".csv") ? basename.slice(-4) : "";
  return `${basename.slice(0, 255 - extension.length)}${extension}`;
}

export async function readCsvUpload(
  shopeeAccountId: unknown,
  formData: FormData,
): Promise<CsvUpload> {
  validateShopeeAccountId(shopeeAccountId);
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new ShopeeImportError("CSV_FILE_REQUIRED", "File CSV wajib dipilih.");
  }

  const originalFilename = sanitizeFilename(file.name);
  if (!originalFilename.toLowerCase().endsWith(".csv")) {
    throw new ShopeeImportError("CSV_EXTENSION_REQUIRED", "File wajib menggunakan ekstensi .csv.");
  }
  if (!ACCEPTED_CSV_MIME_TYPES.has(file.type.toLowerCase())) {
    throw new ShopeeImportError("CSV_INVALID_MIME", "Tipe file CSV tidak didukung.");
  }
  if (file.size > MAX_CSV_BYTES) {
    throw new ShopeeImportError("CSV_TOO_LARGE", "File melebihi batas 10 MiB.");
  }

  return { originalFilename, bytes: new Uint8Array(await file.arrayBuffer()) };
}
