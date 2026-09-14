export type ClickaduConfigInput = {
  id?: unknown;
  campaignId: unknown;
  label: unknown;
  sourceTag: unknown;
};

export type ParsedClickaduConfigInput = {
  id?: number;
  campaignId: string;
  label: string | null;
  sourceTag: string;
};

export class ClickaduConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClickaduConfigError";
  }
}

export function parseClickaduConfigInput(input: ClickaduConfigInput): ParsedClickaduConfigInput {
  const campaignId = requiredText(input.campaignId, "Campaign ID", 64);
  const sourceTag = requiredText(input.sourceTag, "Source Tag", 64).toUpperCase();
  const label = optionalText(input.label, "Label", 191);
  const id = input.id === undefined ? undefined : positiveInteger(input.id, "Konfigurasi");
  return { ...(id === undefined ? {} : { id }), campaignId, label, sourceTag };
}

export function parseShopeeAccountId(value: unknown) {
  return positiveInteger(value, "Akun Shopee");
}

export function parseClickaduConfigId(value: unknown) {
  return positiveInteger(value, "Konfigurasi");
}

export function publicClickaduConfigMessage(error: unknown) {
  return error instanceof ClickaduConfigError ? error.message : "Gagal menyimpan konfigurasi Clickadu.";
}

function requiredText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) throw new ClickaduConfigError(`${label} wajib diisi.`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new ClickaduConfigError(`${label} terlalu panjang.`);
  return normalized;
}

function optionalText(value: unknown, label: string, maxLength: number) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new ClickaduConfigError(`${label} tidak valid.`);
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) throw new ClickaduConfigError(`${label} terlalu panjang.`);
  return normalized;
}

function positiveInteger(value: unknown, label: string) {
  const parsed = typeof value === "string" && value.trim() ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ClickaduConfigError(`${label} tidak valid.`);
  }
  return parsed;
}
