import type { BudgetEligibility, BudgetFlag, BudgetKind, BudgetSnapshot, BudgetValue } from "./budget-types";

export const budgetFlag = (value: unknown): BudgetFlag => value === true ? "TRUE" : value === false ? "FALSE" : value === undefined ? "MISSING" : value === null ? "NULL" : "INVALID";
const zero = (value: BudgetValue) => value.state === "VALUE" && value.value === "0";
const positive = (value: BudgetValue) => value.state === "VALUE" && BigInt(value.value) > BigInt(0);

/** Classification is based exclusively on fresh Meta evidence, never database budget hints. */
export function budgetEligibility(snapshot: BudgetSnapshot, kind: BudgetKind, id: string): BudgetEligibility {
  const object = kind === "campaign" ? snapshot.campaign.id === id ? snapshot.campaign : null : snapshot.adSets.find((row) => row.id === id) ?? null;
  const fail = (reason: string, mode: BudgetEligibility["mode"] = "UNKNOWN"): BudgetEligibility => ({ object, mode, editable: false, reason });
  if (!object) return fail("Jenis/target anggaran tidak ditemukan pada edge Meta yang sesuai.");
  if (!snapshot.complete) return fail("Pembacaan set iklan belum lengkap. Sumber anggaran belum terbukti.");
  const campaign = snapshot.campaign;
  if (!zero(campaign.lifetime)) return fail("Lifetime budget aktif atau bukti lifetime campaign tidak lengkap; hanya daily budget yang dapat diedit.");
  let mode: BudgetEligibility["mode"];
  if (positive(campaign.daily)) {
    if (snapshot.adSets.some((row) => !zero(row.daily) || !zero(row.lifetime))) return fail("Anggaran campaign/set bertentangan atau belum lengkap. Tidak menebak tingkat anggaran.");
    mode = "CAMPAIGN";
  } else if (zero(campaign.daily)) mode = "ADSET";
  else return fail("Daily budget campaign hilang/null/tidak valid; sumber anggaran belum terbukti.");
  if (snapshot.currency !== "IDR") return fail("Penyimpanan hanya untuk IDR; mata uang akun bukan IDR atau belum terbukti.", mode);
  if (campaign.schedule !== "FALSE") return fail("Budget schedule campaign aktif atau statusnya belum tersedia. Penyimpanan diblokir.", mode);
  if (mode === "CAMPAIGN" && kind !== "campaign") return fail("Anggaran dikelola campaign. Ringkasan/anggaran set tidak dapat ditulis.", mode);
  if (mode === "CAMPAIGN" && snapshot.adSets.some((row) => row.schedule !== "FALSE")) return fail("Budget schedule set iklan aktif atau belum terbukti nonaktif; anggaran campaign tidak diubah.", mode);
  if (mode === "ADSET" && kind !== "adset") return fail("Anggaran dikelola per set iklan; pilih satu set, bukan jumlah totalnya.", mode);
  if (!positive(object.daily) || !zero(object.lifetime)) return fail("Target bukan daily budget positif dengan lifetime nol yang terbukti.", mode);
  if (object.schedule !== "FALSE") return fail("Budget schedule target aktif atau belum terbukti nonaktif.", mode);
  return { object, mode, editable: true, reason: "Daily budget IDR terverifikasi. Minimum akhir tetap divalidasi Meta; nominal tidak disesuaikan otomatis." };
}

export function adSetDailyTotal(snapshot: BudgetSnapshot): string | null {
  if (!snapshot.complete || !snapshot.adSets.length || snapshot.adSets.some((row) => row.daily.state !== "VALUE" || !zero(row.lifetime))) return null;
  return snapshot.adSets.reduce((sum, row) => sum + BigInt(row.daily.state === "VALUE" ? row.daily.value : "0"), BigInt(0)).toString();
}
