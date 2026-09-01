import { ShopeeImportError } from "./errors.ts";

export function normalizeTag(value: string, row: number) {
  const display = value.trim();
  if (!display) {
    throw new ShopeeImportError("INVALID_TAG_LINK_2", `Baris ${row}: Tag_link2 tidak boleh kosong.`);
  }
  return { display, normalized: display.toUpperCase() };
}
