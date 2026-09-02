export class ShopeeImportError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ShopeeImportError";
    this.code = code;
  }
}

export function publicImportMessage(error: unknown) {
  return error instanceof ShopeeImportError ? error.message : "Gagal memproses file CSV.";
}
