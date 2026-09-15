export class AdsterraConfigError extends Error { constructor(message: string) { super(message); this.name = "AdsterraConfigError"; } }
export function parseAdsterraConfigInput(input: { id?: unknown; campaignId: unknown; label: unknown; sourceTag: unknown }) {
  const campaignId = required(input.campaignId, "Campaign ID", 64); const sourceTag = required(input.sourceTag, "Tag Link 1", 64).toUpperCase(); const label = optional(input.label, 191); const id = input.id === undefined ? undefined : positive(input.id, "Konfigurasi"); return { ...(id ? { id } : {}), campaignId, label, sourceTag };
}
export function parseShopeeAccountId(value: unknown) { return positive(value, "Akun Shopee"); }
export function parseAdsterraConfigId(value: unknown) { return positive(value, "Konfigurasi"); }
export function publicAdsterraConfigMessage(error: unknown) { return error instanceof AdsterraConfigError ? error.message : "Gagal menyimpan konfigurasi Adsterra."; }
function required(value: unknown, label: string, max: number) { if (typeof value !== "string" || !value.trim()) throw new AdsterraConfigError(`${label} wajib diisi.`); const result = value.trim(); if (result.length > max) throw new AdsterraConfigError(`${label} terlalu panjang.`); return result; }
function optional(value: unknown, max: number) { if (value === null || value === undefined || value === "") return null; if (typeof value !== "string") throw new AdsterraConfigError("Nama campaign tidak valid."); const result = value.trim(); if (!result) return null; if (result.length > max) throw new AdsterraConfigError("Nama campaign terlalu panjang."); return result; }
function positive(value: unknown, label: string) { const result = typeof value === "string" && value.trim() ? Number(value) : value; if (typeof result !== "number" || !Number.isSafeInteger(result) || result <= 0) throw new AdsterraConfigError(`${label} tidak valid.`); return result; }
