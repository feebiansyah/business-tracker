export class ShopeeImportError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ShopeeImportError";
    this.code = code;
  }
}

export const IMPORT_UNCERTAIN_MESSAGE = "Hasil import belum dapat dipastikan. Periksa riwayat import sebelum mencoba ulang.";

export function publicImportMessage(error: unknown, phase: "preview" | "import" = "preview") {
  return error instanceof ShopeeImportError ? error.message : phase === "import" ? IMPORT_UNCERTAIN_MESSAGE : "Gagal memproses file CSV.";
}
