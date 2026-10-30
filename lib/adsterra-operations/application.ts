import { buildAdsterraBlacklistTarget } from "../adsterra-roi/blacklist";
import { adsterraWhitelistCandidates } from "../adsterra-roi/whitelist-analysis";
import type { AdsterraRoiRow } from "../adsterra-roi/types";
import { digest, exactSet, sortedIds } from "./canonical";
import { OperationError, type ApplicationPlan, type ApplicationResult, type ListKind, type Scope, type Snapshot } from "./types";
import type { OperationBudget } from "./budget";
import type { PlacementProvider } from "./provider";
import { capabilityError } from "./method-state";
import { diagnosticText, type OperationDiagnostic } from "./diagnostics";
import { parseWhitelistExclusions } from "./whitelist-exclusions";

export function bidDigest(bids: Snapshot["bids"]) {
  return digest([...bids].sort((a, b) => `${a.placementId}:${a.countryCode}`.localeCompare(`${b.placementId}:${b.countryCode}`)));
}
export function preconditionHash(snapshot: Snapshot, target: string[], kind: ListKind) {
  return digest({ ...snapshot, bids: bidDigest(snapshot.bids), target, kind });
}
export function planApplication(input: {
  scope: Scope; kind: ListKind; rows: readonly AdsterraRoiRow[]; before: Snapshot;
  dateFrom: string; dateTill: string; fxRate: string; inputHash: string; excluded?: unknown;
}): ApplicationPlan {
  const { scope, kind, before } = input;
  const candidates = sortedIds(kind === "BLACKLIST"
    ? buildAdsterraBlacklistTarget([], input.rows).targetPlacementIds.map(String)
    : adsterraWhitelistCandidates(input.rows).map((id) => String(Number(id))));
  const excluded = parseWhitelistExclusions(input.excluded);
  if (excluded.length && (kind !== "WHITELIST" || excluded.some((id) => !candidates.includes(id)))) throw new OperationError("Pengecualian harus bagian kandidat Whitelist pada analisis yang sama.");
  const target = candidates.filter((id) => !excluded.includes(id));
  if (kind === "WHITELIST" && !target.length) throw new OperationError("Kandidat Whitelist kosong. Tidak ada daftar yang akan dikosongkan atau diubah.");
  const existing = kind === "BLACKLIST" ? before.blacklist : before.whitelist;
  const opposite = kind === "BLACKLIST" ? before.whitelist : before.blacklist;
  const blockers: string[] = [];
  const unsupported = capabilityError(kind, before.campaign.pricing);
  if (unsupported) blockers.push(unsupported);
  if (before.method.placementMethod !== kind) blockers.push("Metode aplikasi berbeda/belum ditetapkan. Gunakan Campaign; Placement tidak boleh mengganti metode.");
  if (opposite.length) blockers.push("Daftar berlawanan terisi. Hanya Campaign yang boleh clear melalui konfirmasi metode.");
  return { scope, kind, dateFrom: input.dateFrom, dateTill: input.dateTill, fxRate: input.fxRate, target, excluded, before, opposite,
    added: target.filter((id) => !existing.includes(id)), removed: existing.filter((id) => !target.includes(id)),
    resetBids: kind === "BLACKLIST" ? before.bids.filter((bid) => target.includes(bid.placementId)) : [],
    inputHash: input.inputHash, preconditionHash: preconditionHash(before, target, kind), blockers };
}

/** Pure orchestration boundary: provider/store implementations are injected. */
export async function applyPlacementPlan(plan: ApplicationPlan, provider: PlacementProvider, budget: OperationBudget,
  snapshot: () => Promise<Snapshot>): Promise<ApplicationResult> {
  let phase = "PREFLIGHT";
  let actual: ApplicationResult["actual"] = null;
  const warnings: string[] = [];
  const result = (status: ApplicationResult["status"], message: string): ApplicationResult => {
    if (status === "PARTIAL" && (phase === "VERIFY_LISTS" || phase === "FINAL_VERIFICATION")) provider.recordDiagnostic({
      stage: phase, kind: "VERIFICATION_MISMATCH", httpStatus: null, reasons: ["GET does not match confirmed state"],
    });
    const diagnostics = [...provider.diagnostics];
    const rejected = diagnostics.find((e) => e.kind === "HTTP_ERROR" && (e.stage === "PUT_WHITELIST" || e.stage === "PUT_BLACKLIST"));
    if (status === "PARTIAL" && rejected) message = `Adsterra menolak penerapan (HTTP ${rejected.httpStatus}): ${rejected.reasons.join("; ")}.${rejected.rejected?.length ? ` ID terkait (cuplikan): ${rejected.rejected.flatMap((r) => r.placementIds).join(", ")}.` : " ID yang ditolak tidak tersedia pada respons."} Daftar aktual belum sesuai target. Tidak ada kandidat yang dibuang atau dikirim ulang otomatis.`;
    return { status, phase, message, actual, writeWarnings: [...provider.warnings, ...warnings, ...diagnostics.map(diagnosticText)],
      metadata: "NOT_REQUIRED", diagnostics, writes: provider.sent };
  };
  const desiredLists = (s: Snapshot) => exactSet(s.blacklist, plan.kind === "BLACKLIST" ? plan.target : [])
    && exactSet(s.whitelist, plan.kind === "WHITELIST" ? plan.target : []);
  const view = (s: Snapshot) => { actual = { blacklist: s.blacklist, whitelist: s.whitelist, bids: s.bids }; };
  const attempt = async (write: () => Promise<void>) => {
    try { await write(); }
    catch { warnings.push(`Langkah ${phase} tidak memberi bukti sukses; GET aktual diperiksa tanpa retry write.`); }
  };
  try {
    if (plan.blockers.length) return result("RECONFIRM_REQUIRED", plan.blockers.join(" "));
    const current = await snapshot(); view(current);
    if (preconditionHash(current, plan.target, plan.kind) !== plan.preconditionHash) return result("RECONFIRM_REQUIRED", "Precondition berubah. Konfirmasi ulang sebelum mutasi.");
    if (plan.opposite.length) return result("RECONFIRM_REQUIRED", "Placement tidak boleh clear atau mengganti metode. Kembali ke Campaign.");
    const previousTarget = plan.kind === "BLACKLIST" ? plan.before.blacklist : plan.before.whitelist;
    if (!exactSet(previousTarget, plan.target)) {
      phase = "PUT_TARGET";
      budget.requireRequests(16);
      await attempt(() => provider.put(plan.kind, plan.target));
    }
    phase = "VERIFY_LISTS";
    let after = await snapshot(); view(after);
    if (!desiredLists(after)) return result(provider.ambiguous ? "UNVERIFIED" : "PARTIAL", "Kedua daftar aktual belum cocok dengan target yang dikonfirmasi. Tidak ada rollback/retry.");
    if (provider.ambiguous) return result("UNVERIFIED", "GET saat ini cocok, tetapi request write lama mungkin masih diproses. Guard tetap terkunci.");
    if (after.scopeHash !== plan.before.scopeHash || digest(after.aliases) !== digest(plan.before.aliases)) return result("PARTIAL", "Scope/Auto ON/OFF berubah selama operasi; hentikan dan periksa hasil.");
    if (digest(after.method) !== digest(plan.before.method)) return result("PARTIAL", "Metode/versi berubah selama operasi. Kesiapan tidak diterbitkan.");
    if (bidDigest(after.bids) !== bidDigest(plan.before.bids)) return result("PARTIAL", "Custom Bid berubah di luar precondition konfirmasi. Reset tidak diperluas secara diam-diam.");
    if (plan.kind === "BLACKLIST" && plan.resetBids.length) {
      phase = "RESET_CUSTOM_BIDS";
      budget.requireRequests(9);
      await attempt(() => provider.legacy.deleteCustomBids(plan.scope.campaignId, plan.resetBids));
    }
    // Mandatory even when list/initial bid snapshot was empty or NO_CHANGE.
    phase = "FINAL_VERIFICATION";
    after = await snapshot(); view(after);
    if (provider.ambiguous) return result("UNVERIFIED", "Write mungkin diterapkan, tetapi request belum terbukti selesai. Hasil GET tidak membuka guard otomatis.");
    if (!desiredLists(after)) return result("PARTIAL", "Verifikasi exact set kedua daftar gagal setelah operasi.");
    if (digest(after.method) !== digest(plan.before.method)) return result("PARTIAL", "Versi metode berubah pada verifikasi akhir.");
    if (after.scopeHash !== plan.before.scopeHash || digest(after.aliases) !== digest(plan.before.aliases)) return result("PARTIAL", "Daftar provider sudah dibaca, tetapi scope/Auto berubah pada verifikasi akhir. Periksa operasi; tidak mengklaim sukses penuh.");
    const expectedBids = plan.kind === "BLACKLIST" ? plan.before.bids.filter((bid) => !plan.target.includes(bid.placementId)) : plan.before.bids;
    if (bidDigest(after.bids) !== bidDigest(expectedBids)) return result("PARTIAL", "Sebagian Custom Bid belum kosong atau snapshot bid berubah. Tidak mengklaim sukses penuh.");
    const changed = plan.opposite.length > 0 || !exactSet(previousTarget, plan.target) || plan.resetBids.length > 0;
    return result(changed ? "VERIFIED" : "NO_CHANGE", changed
      ? `Kedua daftar dan dampak Custom Bid sudah diverifikasi. Ini bukan deteksi mode editor.${plan.kind === "BLACKLIST" && !plan.target.length ? " Blacklist API kosong: tidak ada placement yang dikecualikan." : ""}`
      : "Kedua daftar dan Custom Bid sudah sesuai; tidak ada mutasi provider.");
  } catch {
    provider.recordDiagnostic({ stage: phase as OperationDiagnostic["stage"], kind: "OPERATION_INTERRUPTED", httpStatus: null, reasons: ["Operation interrupted"] });
    return result(provider.ambiguous ? "UNVERIFIED" : provider.sent ? "PARTIAL" : "RECONFIRM_REQUIRED",
      "Operasi dihentikan karena timeout, guard, atau verifikasi gagal. Hasil yang sempat dibaca bukan jaminan keadaan akhir; write tidak diulang.");
  }
}
