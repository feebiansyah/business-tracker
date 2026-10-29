import { buildAdsterraBlacklistTarget } from "../adsterra-roi/blacklist";
import { adsterraWhitelistCandidates } from "../adsterra-roi/whitelist-analysis";
import type { AdsterraRoiRow } from "../adsterra-roi/types";
import { digest, exactSet, sortedIds } from "./canonical";
import { OperationError, type ApplicationPlan, type ApplicationResult, type ListKind, type Scope, type Snapshot } from "./types";
import type { OperationBudget } from "./budget";
import type { PlacementProvider } from "./provider";

export function bidDigest(bids: Snapshot["bids"]) {
  return digest([...bids].sort((a, b) => `${a.placementId}:${a.countryCode}`.localeCompare(`${b.placementId}:${b.countryCode}`)));
}
export function preconditionHash(snapshot: Snapshot, target: string[], kind: ListKind) {
  return digest({ ...snapshot, bids: bidDigest(snapshot.bids), target, kind });
}
export function planApplication(input: {
  scope: Scope; kind: ListKind; rows: readonly AdsterraRoiRow[]; before: Snapshot;
  dateFrom: string; dateTill: string; fxRate: string; inputHash: string;
}): ApplicationPlan {
  const { scope, kind, before } = input;
  const target = sortedIds(kind === "BLACKLIST"
    ? buildAdsterraBlacklistTarget([], input.rows).targetPlacementIds.map(String)
    : adsterraWhitelistCandidates(input.rows).map((id) => String(Number(id))));
  if (kind === "WHITELIST" && !target.length) throw new OperationError("Kandidat Whitelist kosong. Tidak ada daftar yang akan dikosongkan atau diubah.");
  const existing = kind === "BLACKLIST" ? before.blacklist : before.whitelist;
  const opposite = kind === "BLACKLIST" ? before.whitelist : before.blacklist;
  const blockers: string[] = [];
  if (!["CPM", "CPC", "CPA"].includes(before.campaign.pricing)) blockers.push("Dukungan pricing campaign belum terbukti; penerapan tetap baca-saja.");
  if (kind === "WHITELIST" && !["CPM", "CPC"].includes(before.campaign.pricing)) blockers.push(before.campaign.pricing === "CPA" ? "Whitelist tidak didukung untuk campaign CPA." : "Dukungan pricing campaign untuk Whitelist belum terbukti.");
  if (opposite.length) {
    if (before.campaign.active !== 1) blockers.push("Clear daftar berlawanan memerlukan status provider strictly INACTIVE (LIMITED tidak cukup). Matikan secara manual dahulu.");
    if (before.aliases.some((alias) => alias.autoScheduleEnabled)) blockers.push("Nonaktifkan Auto ON/OFF pada SEMUA konfigurasi yang menunjuk campaign fisik ini dahulu.");
  }
  return { scope, kind, dateFrom: input.dateFrom, dateTill: input.dateTill, fxRate: input.fxRate, target, before, opposite,
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
  const result = (status: ApplicationResult["status"], message: string): ApplicationResult => ({
    status, phase, message, actual, writeWarnings: [...provider.warnings, ...warnings], metadata: "NOT_REQUIRED",
  });
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
    if (plan.opposite.length) {
      phase = "CLEAR_OPPOSITE"; budget.check(35_000);
      await attempt(() => provider.clear(plan.kind === "BLACKLIST" ? "WHITELIST" : "BLACKLIST"));
      phase = "VERIFY_CLEAR";
      const after = await snapshot(); view(after);
      const opposite = plan.kind === "BLACKLIST" ? after.whitelist : after.blacklist;
      if (provider.ambiguous) return result("UNVERIFIED", "Clear mungkin diterapkan, tetapi request belum terbukti selesai. Tidak meneruskan PUT.");
      if (opposite.length) return result("PARTIAL", "Clear daftar berlawanan belum terverifikasi kosong. PUT target tidak dikirim.");
      // Only the explicitly confirmed opposite-list change may be ignored here.
      const expected = { ...plan.before, ...(plan.kind === "BLACKLIST" ? { whitelist: [] } : { blacklist: [] }) };
      if (preconditionHash(after, plan.target, plan.kind) !== preconditionHash(expected, plan.target, plan.kind)
        || after.campaign.active !== 1 || after.aliases.some((a) => a.autoScheduleEnabled)) return result("PARTIAL", "Prasyarat/daftar/bid berubah setelah clear. PUT tidak dikirim; konfirmasi ulang melalui pemulihan.");
    }
    const previousTarget = plan.kind === "BLACKLIST" ? plan.before.blacklist : plan.before.whitelist;
    if (!exactSet(previousTarget, plan.target)) {
      phase = "PUT_TARGET";
      await attempt(() => provider.put(plan.kind, plan.target));
    }
    phase = "VERIFY_LISTS";
    let after = await snapshot(); view(after);
    if (!desiredLists(after)) return result(provider.ambiguous ? "UNVERIFIED" : "PARTIAL", "Kedua daftar aktual belum cocok dengan target yang dikonfirmasi. Tidak ada rollback/retry.");
    if (provider.ambiguous) return result("UNVERIFIED", "GET saat ini cocok, tetapi request write lama mungkin masih diproses. Guard tetap terkunci.");
    if (after.scopeHash !== plan.before.scopeHash || digest(after.aliases) !== digest(plan.before.aliases)) return result("PARTIAL", "Scope/Auto ON/OFF berubah selama operasi; hentikan dan periksa hasil.");
    if (bidDigest(after.bids) !== bidDigest(plan.before.bids)) return result("PARTIAL", "Custom Bid berubah di luar precondition konfirmasi. Reset tidak diperluas secara diam-diam.");
    if (plan.kind === "BLACKLIST" && plan.resetBids.length) {
      phase = "RESET_CUSTOM_BIDS";
      await attempt(() => provider.legacy.deleteCustomBids(plan.scope.campaignId, plan.resetBids));
    }
    // Mandatory even when list/initial bid snapshot was empty or NO_CHANGE.
    phase = "FINAL_VERIFICATION";
    after = await snapshot(); view(after);
    if (provider.ambiguous) return result("UNVERIFIED", "Write mungkin diterapkan, tetapi request belum terbukti selesai. Hasil GET tidak membuka guard otomatis.");
    if (!desiredLists(after)) return result("PARTIAL", "Verifikasi exact set kedua daftar gagal setelah operasi.");
    if (after.scopeHash !== plan.before.scopeHash || digest(after.aliases) !== digest(plan.before.aliases)) return result("PARTIAL", "Daftar provider sudah dibaca, tetapi scope/Auto berubah pada verifikasi akhir. Periksa operasi; tidak mengklaim sukses penuh.");
    const expectedBids = plan.kind === "BLACKLIST" ? plan.before.bids.filter((bid) => !plan.target.includes(bid.placementId)) : plan.before.bids;
    if (bidDigest(after.bids) !== bidDigest(expectedBids)) return result("PARTIAL", "Sebagian Custom Bid belum kosong atau snapshot bid berubah. Tidak mengklaim sukses penuh.");
    const changed = plan.opposite.length > 0 || !exactSet(previousTarget, plan.target) || plan.resetBids.length > 0;
    return result(changed ? "VERIFIED" : "NO_CHANGE", changed
      ? "Kedua daftar dan dampak Custom Bid sudah diverifikasi. Ini bukan deteksi mode editor."
      : "Kedua daftar dan Custom Bid sudah sesuai; tidak ada mutasi provider.");
  } catch {
    return result(provider.ambiguous ? "UNVERIFIED" : provider.sent ? "PARTIAL" : "RECONFIRM_REQUIRED",
      "Operasi dihentikan karena timeout, guard, atau verifikasi gagal. Hasil yang sempat dibaca bukan jaminan keadaan akhir; write tidak diulang.");
  }
}
