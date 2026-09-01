export class ShopeeImportError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ShopeeImportError";
    this.code = code;
  }
}
