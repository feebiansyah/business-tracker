export const REQUIRED_HEADERS = [
  "Waktu Pemesanan",
  "Tag_link1",
  "Komisi Bersih Affiliate (Rp)",
] as const;

export const MAX_CSV_BYTES = 10 * 1024 * 1024;
export const MAX_CSV_ROWS = 100_000;
export const MAX_COMMISSION_CSV_BYTES = 15 * 1024 * 1024;
export const MAX_CLICK_CSV_ROWS = 200_000;

export function csvSizeError(size: number, maxBytes: number) {
  return size > maxBytes ? `Ukuran file CSV melebihi batas ${maxBytes / (1024 * 1024)} MiB.` : null;
}
