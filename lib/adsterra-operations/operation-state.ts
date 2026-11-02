import type { AdsterraCampaignOperation } from "../generated/prisma/client";
import { readDiagnostics, type CompletionEvidence } from "./diagnostics";

type Row = AdsterraCampaignOperation;
export const terminalStatuses = ["IDLE", "VERIFIED", "NO_CHANGE", "RECONFIRM_REQUIRED"];
export const offTerminalStatuses = [...terminalStatuses, "PARTIAL"];
export const completedFailure = (r: Row) => r.status === "PARTIAL" && ["FINISHED", "NOT_DISPATCHED"].includes(r.phase) && !r.uncertain;
export const offBlocked = (r: Row) => !offTerminalStatuses.includes(r.protectiveOffStatus) || r.protectiveOffUncertain;
export const mainBlocked = (r: Row, now: number) => r.uncertain || !(terminalStatuses.includes(r.status) || completedFailure(r)
  || r.status === "PREPARED" && !!r.expiresAt && r.expiresAt.getTime() <= now);

/** Only a receipt written by the ended OFF pipeline can prove settled transport.
 * Legacy summaries, a matching GET, age and uncertain=false are NOT receipts. */
export function settledOffEvidence(r: Row): CompletionEvidence | null {
  if (r.protectiveOffStatus !== "UNVERIFIED" || r.protectiveOffUncertain || r.uncertain) return null;
  let data: unknown;
  try { data = JSON.parse(r.protectiveOffSummary ?? ""); } catch { return null; }
  const proof = (data as { completion?: CompletionEvidence } | null)?.completion;
  if (!proof || proof.v !== 1 || proof.settled !== true || proof.operationId !== r.protectiveOffId
    || proof.generation !== r.protectiveOffGeneration || !proof.awaitingActivation
    || proof.awaitingActivation.operationId !== r.operationId || !Number.isSafeInteger(proof.awaitingActivation.generation)
    || proof.awaitingActivation.generation < 0 || r.generation < proof.awaitingActivation.generation
    || !["ACTIVATE", "SCHEDULE_ON"].includes(r.action)
    || !(terminalStatuses.includes(r.status) || completedFailure(r))) return null;
  return proof;
}

const actionLabels: Record<string, string> = {
  CUSTOM_BID_SAVE: "Penyimpanan Custom Bid", CUSTOM_BID_DELETE: "Penghapusan Custom Bid",
  APPLY_BLACKLIST: "Penerapan Blacklist", APPLY_WHITELIST: "Penerapan Whitelist", SET_METHOD: "Pergantian metode",
  ACTIVATE: "Pengaktifan campaign", SCHEDULE_ON: "Pengaktifan terjadwal", AUTO_ENABLE: "Pengaktifan Auto",
  CONFIG_CHANGE: "Perubahan konfigurasi", PROTECTIVE_OFF: "OFF pengaman", SCHEDULE_OFF: "OFF terjadwal",
};
export function operationReadout(row: Row | null, now: number) {
  if (!row) return { pending: false, message: "Tidak ada perubahan yang tertunda.", slots: [] };
  const settledOff = settledOffEvidence(row);
  const slots = [
    { slot: "MAIN" as const, action: actionLabels[row.action] ?? "Perubahan campaign", status: row.status, phase: row.phase,
      generation: row.generation, uncertain: row.uncertain, at: row.startedAt?.toISOString() ?? null,
      blocked: mainBlocked(row, now), origin: readDiagnostics(row.summary) },
    { slot: "PROTECTIVE_OFF" as const, action: "OFF pengaman", status: row.protectiveOffStatus, phase: null,
      generation: row.protectiveOffGeneration, uncertain: row.protectiveOffUncertain, at: row.protectiveOffAt?.toISOString() ?? null,
      blocked: offBlocked(row) && !settledOff, origin: readDiagnostics(row.protectiveOffSummary) },
  ];
  const blockers = slots.filter((s) => s.blocked);
  const pending = blockers.length > 0;
  const message = blockers.length ? blockers.map((s) => s.uncertain
    ? `${s.action} belum dapat dipastikan selesai; jangan mengulang tindakan tersebut.`
    : s.status === "PREPARED" ? `${s.action} masih menunggu konfirmasi atau pembatalan.`
    : `${s.action} masih tercatat ${s.status === "RUNNING" ? "berjalan" : "belum terverifikasi"}; bukti penyelesaian belum tersedia.`).join(" ")
    : settledOff ? "OFF sebelumnya sudah selesai; pencatatannya dapat diselesaikan saat menyiapkan konfirmasi baru, tanpa mengulang write."
    : row.status === "PARTIAL" || row.protectiveOffStatus === "PARTIAL"
      ? "Permintaan sebelumnya selesai sebagian. Siapkan konfirmasi baru dari keadaan terbaru."
      : "Tidak ada perubahan yang tertunda.";
  return { pending, message, slots };
}
