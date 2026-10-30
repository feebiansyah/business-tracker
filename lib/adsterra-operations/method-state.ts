import { digest, sortedIds } from "./canonical";
import { OperationError, type BlacklistValue, type ListKind, type MethodState, type Readiness, type Snapshot } from "./types";
import { isLegacyUnconfiguredMethod } from "./method-activation";
import { isWhitelistBlacklistRefusal } from "./list-evidence";

export type StoredMethodRow = Omit<MethodState, "placementMethod"> & { placementMethod: string | null };
export function storedMethod(row: StoredMethodRow | null): MethodState {
  if (row === null) return { placementMethod: null, methodVersion: 0, methodReady: false, approvedBlacklistHash: null, approvedWhitelistHash: null };
  if ((row.placementMethod !== null && row.placementMethod !== "BLACKLIST" && row.placementMethod !== "WHITELIST")
    || !Number.isSafeInteger(row.methodVersion) || row.methodVersion < 0 || typeof row.methodReady !== "boolean"
    || [row.approvedBlacklistHash, row.approvedWhitelistHash].some((hash) => hash !== null && (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)))) {
    throw new OperationError("Metadata metode tidak valid/tidak tersedia. Ini bukan metode belum ditetapkan.");
  }
  return { placementMethod: row.placementMethod, methodVersion: row.methodVersion, methodReady: row.methodReady,
    approvedBlacklistHash: row.approvedBlacklistHash, approvedWhitelistHash: row.approvedWhitelistHash };
}
export function listDigest(ids: readonly string[] | BlacklistValue) {
  if (Array.isArray(ids)) return digest(sortedIds(ids));
  if (!isWhitelistBlacklistRefusal(ids)) throw new OperationError("Bukti pembacaan Blacklist tidak valid.");
  return digest({ contract: "BLACKLIST_UNREADABLE_WHITELIST_V1", ...ids });
}
export function blacklistSummary(blacklist: BlacklistValue) {
  return Array.isArray(blacklist) ? { count: blacklist.length, digest: listDigest(blacklist) }
    : { count: null, digest: listDigest(blacklist), evidence: blacklist };
}
export function capabilityError(kind: ListKind, pricing: string) {
  if (!["CPM", "CPC", "CPA"].includes(pricing)) return "Capability/pricing campaign belum dapat dibuktikan.";
  return kind === "WHITELIST" && pricing === "CPA" ? "Whitelist tidak didukung untuk campaign CPA." : null;
}
export function assessReadiness(method: MethodState, lists: {
  blacklist: { count: number | null; digest: string; evidence?: BlacklistValue } | null; whitelist: { count: number; digest: string } | null;
}, pricing: string | null): { readiness: Readiness; message: string } {
  const { blacklist, whitelist } = lists;
  if (method.placementMethod === null && !isLegacyUnconfiguredMethod(method)) return { readiness: "NOT_APPLIED",
    message: "Pengaturan metode belum selesai. Konfirmasi metode kembali di Campaign sebelum ON atau mengaktifkan Auto. OFF dan penonaktifan Auto tetap tersedia." };
  if (!blacklist || !whitelist || !pricing) return { readiness: "UNVERIFIABLE", message: "Kedua daftar/capability belum dapat diverifikasi; bukan daftar kosong." };
  if (blacklist.count === null && (!isWhitelistBlacklistRefusal(blacklist.evidence) || !whitelist.count
    || blacklist.digest !== listDigest(blacklist.evidence))) return { readiness: "UNVERIFIABLE", message: "Bukti penolakan Blacklist/Whitelist tidak lengkap; bukan daftar kosong." };
  if (blacklist.count && whitelist.count) return { readiness: "CONFLICT", message: "Kedua daftar API terisi. Tidak menebak mode editor atau memperbaiki konflik otomatis." };
  if (!method.placementMethod) return { readiness: "NOT_APPLIED", message: "Metode aplikasi belum dipilih. ON/OFF dan Auto campaign lama tetap tersedia." };
  const unsupported = capabilityError(method.placementMethod, pricing);
  if (unsupported) return { readiness: "UNVERIFIABLE", message: unsupported };
  const opposite = method.placementMethod === "BLACKLIST" ? whitelist : blacklist;
  if (opposite.count || (method.placementMethod === "BLACKLIST" && blacklist.count === null)) return { readiness: "CONFLICT", message: "Daftar berlawanan terisi atau Blacklist belum dapat dibaca. Perubahan metode/clear hanya melalui Campaign." };
  if (!method.methodReady) return { readiness: "NOT_APPLIED", message: method.placementMethod === "WHITELIST" && !whitelist.count
    ? "Whitelist belum diisi. Terapkan hasil analisis Placement sebelum ON."
    : "Perubahan daftar belum selesai. Terapkan kembali dari analisis terbaru sebelum ON." };
  if (method.approvedBlacklistHash !== blacklist.digest || method.approvedWhitelistHash !== whitelist.digest
    || (method.placementMethod === "WHITELIST" && !whitelist.count)) return { readiness: "LIST_CHANGED", message: "Daftar berubah dari persetujuan terakhir. Konfirmasi penerapan baru diperlukan; GET tidak menyetujui perubahan." };
  return { readiness: "READY", message: method.placementMethod === "WHITELIST" && blacklist.count === null
    ? "Whitelist terverifikasi sesuai persetujuan. Blacklist API tidak dapat dibaca karena campaign memiliki Whitelist; bukan blacklist kosong atau deteksi mode editor."
    : method.placementMethod === "BLACKLIST" && !blacklist.count
    ? "Siap; Blacklist API kosong sehingga tidak mengecualikan placement apa pun. Bukan klaim mode editor."
    : "Siap berdasarkan metode aplikasi dan kedua daftar API yang disetujui; bukan mode editor." };
}
export function requireActivationReady(snapshot: Pick<Snapshot, "method" | "campaign" | "blacklist" | "whitelist">) {
  if (isLegacyUnconfiguredMethod(snapshot.method)) return snapshot.method;
  if (!Array.isArray(snapshot.blacklist) && snapshot.blacklist.campaignId !== snapshot.campaign.id) throw new OperationError("Bukti pembacaan daftar tidak sesuai identitas campaign. Aktivasi ditahan.");
  const result = assessReadiness(snapshot.method, {
    blacklist: blacklistSummary(snapshot.blacklist),
    whitelist: { count: snapshot.whitelist.length, digest: listDigest(snapshot.whitelist) },
  }, snapshot.campaign.pricing);
  if (result.readiness !== "READY") throw new OperationError(`Aktivasi/AutoEnable diblokir: ${result.message}`);
  return snapshot.method;
}
