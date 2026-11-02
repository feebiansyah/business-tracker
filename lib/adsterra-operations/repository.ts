import { randomUUID } from "node:crypto";
import type { PrismaClient, AdsterraCampaignOperation } from "../generated/prisma/client";
import { campaignKey } from "./canonical";
import { OperationError } from "./types";
import type { OperationBudget } from "./budget";
import type { BlacklistValue, ListKind, MethodState } from "./types";
import { storedMethod, listDigest } from "./method-state";
import { historicalCustomBidRiskSummary, readHistoricalCustomBidRisk, retainFailureSummary, retainHistoricalCustomBidRisk, type HistoricalCustomBidRisk } from "./diagnostics";
import { completedAmbiguousCustomBid, completedFailure, offBlocked, offTerminalStatuses, operationReadout, settledOffEvidence, terminalStatuses } from "./operation-state";
export { offBlocked } from "./operation-state";

export type OperationRow = AdsterraCampaignOperation;
export type Fence = { campaignId: string; operationId: string; generation: number; protective?: boolean; historicalCustomBidRisk?: HistoricalCustomBidRisk };
export type WriteMarker = { readonly fence: Fence; readonly phase: string };
export class MarkerPersistenceUncertain extends OperationError {}
const terminal = terminalStatuses;
const offTerminal = offTerminalStatuses;
// FINISHED is written only after the pipeline returns. A settled rejection is
// not an in-flight request. Never extend this to RUNNING or UNVERIFIED.
const available = (r: OperationRow, now: number) => !r.uncertain && !offBlocked(r)
  && !readHistoricalCustomBidRisk(r.summary)
  && (terminal.includes(r.status) || completedFailure(r) || (r.status === "PREPARED" && !!r.expiresAt && r.expiresAt.getTime() <= now));
const listReservation = (action: string, prepared: { preconditionHash: string; expiresAt: Date } | undefined, allow: boolean) =>
  allow && !!prepared && ["APPLY_BLACKLIST", "APPLY_WHITELIST", "SET_METHOD"].includes(action);

export class CampaignOperationStore {
  private readonly markers = new WeakSet<WriteMarker>();
  constructor(private readonly db: Pick<PrismaClient, "adsterraCampaignOperation">, private readonly budget: OperationBudget) {}
  async read(id: string) { return this.budget.wait(this.db.adsterraCampaignOperation.findUnique({ where: { campaignId: campaignKey(id) } })); }
  async method(id: string) { return storedMethod(await this.read(id)); }
  async invalidateMethod(f: Fence, expected: MethodState) {
    await this.assert(f);
    const changed = await this.budget.wait(this.db.adsterraCampaignOperation.updateMany({ where: {
      campaignId: f.campaignId, operationId: f.operationId, generation: f.generation, status: "RUNNING", uncertain: false,
      ...expected, protectiveOffStatus: { in: offTerminal }, protectiveOffUncertain: false,
    }, data: { methodVersion: { increment: 1 }, methodReady: false, phase: "METHOD_INVALIDATED" } }));
    if (changed.count !== 1) throw new OperationError("Versi/metode/fencing berubah sebelum invalidasi. Tidak ada dispatch.");
    return { ...expected, methodVersion: expected.methodVersion + 1, methodReady: false };
  }
  async finalizeMethod(f: Fence, expected: MethodState, kind: ListKind, ready: boolean, lists: { blacklist: BlacklistValue; whitelist: string[] }, expiresAt = Infinity) {
    const previous = await this.assert(f);
    if (this.budget.now() >= expiresAt) throw new OperationError("Konfirmasi berakhir sebelum penyimpanan metode.");
    const changed = await this.budget.wait(this.db.adsterraCampaignOperation.updateMany({ where: {
      campaignId: f.campaignId, operationId: f.operationId, generation: f.generation, status: "RUNNING", uncertain: false, ...expected,
      protectiveOffStatus: { in: offTerminal }, protectiveOffUncertain: false,
    }, data: { placementMethod: kind, methodReady: ready, approvedBlacklistHash: listDigest(lists.blacklist),
      approvedWhitelistHash: listDigest(lists.whitelist), status: "VERIFIED", phase: "METHOD_CONFIRMED",
      summary: retainHistoricalCustomBidRisk(previous.summary, retainFailureSummary(previous.summary,
        JSON.stringify({ v: 1, status: "VERIFIED", phase: "METHOD_FINALIZE", metadata: "RECORDED", diagnostics: [] }))) } }));
    if (changed.count !== 1) throw new OperationError("Finalisasi metode gagal; kesiapan tidak diterbitkan oleh proses lama.");
  }
  private async ensure(id: string) {
    const campaignId = campaignKey(id);
    let row = await this.read(campaignId);
    if (row) return row;
    try { row = await this.budget.wait(this.db.adsterraCampaignOperation.create({ data: {
      campaignId, operationId: randomUUID(), owner: "system", action: "NONE", status: "IDLE", phase: "IDLE",
    } })); }
    catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "P2002")) throw error;
      row = await this.read(campaignId);
    }
    if (!row) throw new OperationError("Guard operasi Adsterra tidak tersedia.");
    return row;
  }
  async reserve(id: string, owner: string, action: string, prepared?: { preconditionHash: string; expiresAt: Date }, options?: { allowCompletedAmbiguousCustomBid?: boolean }) {
    const row = await this.settleCompletedOff(await this.ensure(id));
    const allowsListReplacement = listReservation(action, prepared, options?.allowCompletedAmbiguousCustomBid === true);
    const existingRisk = readHistoricalCustomBidRisk(row.summary);
    const risk: HistoricalCustomBidRisk | null = existingRisk ?? (allowsListReplacement && completedAmbiguousCustomBid(row) && !offBlocked(row) ? {
      v: 1, action: row.action as HistoricalCustomBidRisk["action"], operationId: row.operationId,
      generation: row.generation, outcome: "UNKNOWN_NOT_RESOLVED",
    } : null);
    const replacesInitialRisk = !!risk && !existingRisk;
    const canReserve = available(row, this.budget.now()) || allowsListReplacement && !!risk && !offBlocked(row)
      && (replacesInitialRisk || !row.uncertain && (terminal.includes(row.status) || completedFailure(row)
        || row.status === "PREPARED" && !!row.expiresAt && row.expiresAt.getTime() <= this.budget.now()));
    if (!canReserve) throw new OperationError(`${operationReadout(row, this.budget.now()).message} Periksa Status untuk melihat catatannya; OFF dan Nonaktifkan Auto tetap tersedia jika slotnya tidak tertunda.`);
    const operationId = randomUUID();
    const result = await this.budget.wait(this.db.adsterraCampaignOperation.updateMany({
      where: { campaignId: row.campaignId, operationId: row.operationId, generation: row.generation, status: row.status,
        action: row.action, phase: row.phase, uncertain: replacesInitialRisk ? true : false,
        summary: row.summary,
        protectiveOffId: row.protectiveOffId, protectiveOffGeneration: row.protectiveOffGeneration,
        protectiveOffStatus: row.protectiveOffStatus, protectiveOffUncertain: false },
      data: { operationId, generation: { increment: 1 }, owner, action, phase: prepared ? "CONFIRMATION" : "PREFLIGHT",
        status: prepared ? "PREPARED" : "RUNNING", uncertain: false,
        confirmationHash: null, preconditionHash: prepared?.preconditionHash ?? null,
        expiresAt: prepared?.expiresAt ?? null, startedAt: new Date(this.budget.now()),
        ...(risk ? { summary: historicalCustomBidRiskSummary(risk, row.summary) } : {}) },
    }));
    if (result.count !== 1) throw new OperationError("Campaign diklaim proses lain. Muat ulang sebelum melanjutkan.");
    return { campaignId: row.campaignId, operationId, generation: row.generation + 1, ...(risk ? { historicalCustomBidRisk: risk } : {}) } satisfies Fence;
  }
  async attachConfirmation(f: Fence, hash: string) { await this.update(f, { confirmationHash: hash }, "PREPARED"); }
  async cancel(f: Fence, owner: string, hash: string) {
    const changed = await this.budget.wait(this.db.adsterraCampaignOperation.updateMany({ where: {
      campaignId: f.campaignId, operationId: f.operationId, generation: f.generation, owner, confirmationHash: hash, status: "PREPARED",
    }, data: { status: "RECONFIRM_REQUIRED", confirmationHash: null, phase: "CANCELLED" } }));
    if (changed.count !== 1) throw new OperationError("Konfirmasi tidak lagi PREPARED; jangan membatalkan operasi yang sudah berjalan.");
  }
  async claim(f: Fence, owner: string, hash: string, expiresAt: number) {
    this.budget.check();
    if (this.budget.now() >= expiresAt) throw new OperationError("Konfirmasi kedaluwarsa. Siapkan ulang.");
    const result = await this.budget.wait(this.db.adsterraCampaignOperation.updateMany({
      where: { ...f, owner, confirmationHash: hash, status: "PREPARED", uncertain: false,
        expiresAt: { gt: new Date(this.budget.now()) }, protectiveOffStatus: { in: offTerminal }, protectiveOffUncertain: false },
      data: { status: "RUNNING", phase: "PREFLIGHT", confirmationHash: null },
    }));
    if (result.count !== 1) throw new OperationError("Konfirmasi sudah dipakai/berubah atau campaign terkunci. Siapkan ulang.");
  }
  async assert(f: Fence) {
    const row = await this.read(f.campaignId);
    const valid = f.protective
      ? row?.protectiveOffId === f.operationId && row.protectiveOffGeneration === f.generation && row.protectiveOffStatus === "RUNNING" && !row.protectiveOffUncertain
      : row?.operationId === f.operationId && row.generation === f.generation && row.status === "RUNNING" && !row.uncertain && !offBlocked(row);
    if (!valid) throw new OperationError("Guard operasi hilang atau ada request belum pasti. Tidak menjadwalkan write berikutnya.");
    this.budget.check();
    return row!;
  }
  async beforeWrite(f: Fence, phase: string) {
    const row = await this.assert(f);
    let changed: { count: number };
    try {
      changed = await this.budget.wait(this.db.adsterraCampaignOperation.updateMany({
        where: f.protective
          ? { campaignId: f.campaignId, protectiveOffId: f.operationId, protectiveOffGeneration: f.generation,
            protectiveOffStatus: "RUNNING", protectiveOffUncertain: false }
          : { campaignId: f.campaignId, operationId: f.operationId, generation: f.generation, status: "RUNNING", uncertain: false,
            protectiveOffGeneration: row.protectiveOffGeneration, protectiveOffStatus: row.protectiveOffStatus, protectiveOffUncertain: false },
        data: f.protective ? { protectiveOffUncertain: true, protectiveOffSummary: phase } : { phase, uncertain: true },
      }));
    } catch {
      // No receipt: a late marker query may still commit. sent===0 proves nothing.
      throw new MarkerPersistenceUncertain("Pencatatan marker database belum pasti. Tidak ada dispatch HTTP; guard tetap diblokir.");
    }
    if (changed.count !== 1) throw new OperationError("Guard berubah sebelum dispatch. Write tidak dikirim.");
    // Return proof before any further validation/budget check can throw.
    const marker: WriteMarker = { fence: { ...f }, phase };
    this.markers.add(marker);
    return marker;
  }
  async settleNotDispatched(marker: WriteMarker, hadEarlierDispatch: boolean) {
    if (!this.markers.delete(marker)) throw new OperationError("Bukti marker tidak tersedia/sudah digunakan.");
    const { fence: f, phase } = marker;
    const status = hadEarlierDispatch ? "PARTIAL" : "RECONFIRM_REQUIRED";
    const changed = await this.budget.settle(this.db.adsterraCampaignOperation.updateMany({
      where: f.protective
        ? { campaignId: f.campaignId, protectiveOffId: f.operationId, protectiveOffGeneration: f.generation,
          protectiveOffStatus: "RUNNING", protectiveOffUncertain: true, protectiveOffSummary: phase }
        : { campaignId: f.campaignId, operationId: f.operationId, generation: f.generation,
          status: "RUNNING", uncertain: true, phase },
      // A timed-out cleanup may commit late: keep RUNNING until this proof write
      // is acknowledged, so that late cleanup alone can never release the slot.
      data: f.protective ? { protectiveOffUncertain: false, protectiveOffSummary: "NOT_DISPATCHED" }
        : { uncertain: false, phase: "NOT_DISPATCHED" },
    }));
    if (changed.count !== 1) throw new OperationError("Generation/marker berubah; ketidakpastian tidak dibuka.");
    const finished = await this.budget.settle(this.db.adsterraCampaignOperation.updateMany({
      where: f.protective
        ? { campaignId: f.campaignId, protectiveOffId: f.operationId, protectiveOffGeneration: f.generation,
          protectiveOffStatus: "RUNNING", protectiveOffUncertain: false, protectiveOffSummary: "NOT_DISPATCHED" }
        : { campaignId: f.campaignId, operationId: f.operationId, generation: f.generation,
          status: "RUNNING", uncertain: false, phase: "NOT_DISPATCHED" },
      data: f.protective ? { protectiveOffStatus: status } : { status },
    }));
    if (finished.count !== 1) throw new OperationError("Generation berubah saat menyelesaikan non-dispatch; guard tidak dibuka oleh proses lama.");
    return status;
  }
  markDispatched(marker: WriteMarker) {
    if (!this.markers.delete(marker)) throw new OperationError("Bukti marker sebelum dispatch tidak tersedia.");
  }
  async acknowledged(f: Fence) {
    if (f.protective) await this.updateOff(f, { protectiveOffUncertain: false });
    else await this.update(f, { uncertain: false });
  }
  async dispatchAllowed(f: Fence) {
    const row = await this.read(f.campaignId);
    const matches = f.protective ? row?.protectiveOffId === f.operationId && row.protectiveOffGeneration === f.generation && row.protectiveOffStatus === "RUNNING"
      : row?.operationId === f.operationId && row.generation === f.generation && row.status === "RUNNING" && !offBlocked(row);
    if (!matches) throw new OperationError("Generation berubah sebelum dispatch; write tidak dikirim.");
    this.budget.check();
  }
  async finish(f: Fence, status: string, summary: string) {
    const row = await this.read(f.campaignId);
    // A matching GET cannot clear uncertainty, nor release another generation.
    const uncertain = f.protective ? row?.protectiveOffUncertain : row?.uncertain;
    const actualStatus = uncertain ? "UNVERIFIED" : status;
    if (f.protective) await this.updateOff(f, { protectiveOffStatus: actualStatus, protectiveOffSummary: summary.slice(0, 1000) });
    else {
      const retained = retainFailureSummary(row?.summary ?? null, summary);
      const clearHistoricalRisk = ["APPLY_BLACKLIST", "APPLY_WHITELIST"].includes(row?.action ?? "") && ["VERIFIED", "NO_CHANGE"].includes(actualStatus);
      await this.update(f, { status: actualStatus, phase: "FINISHED", summary: clearHistoricalRisk ? retained : retainHistoricalCustomBidRisk(row?.summary ?? null, retained) });
    }
    return actualStatus;
  }
  async finishNotDispatched(f: Fence, status: "PARTIAL" | "RECONFIRM_REQUIRED", summary: string) {
    // The provider has already awaited BOTH receipt-based settlement writes.
    // Preserve proof/evidence without re-opening any RUNNING/uncertain request.
    const previous = await this.read(f.campaignId);
    const changed = await this.budget.settle(this.db.adsterraCampaignOperation.updateMany({ where: {
      campaignId: f.campaignId, operationId: f.operationId, generation: f.generation,
      status, phase: "NOT_DISPATCHED", uncertain: false,
    }, data: { phase: "FINISHED", summary: retainHistoricalCustomBidRisk(previous?.summary ?? null,
      retainFailureSummary(previous?.summary ?? null, summary)) } }));
    if (changed.count !== 1) throw new OperationError("Pencatatan non-dispatch berubah; tidak menimpa operasi lain.");
  }
  async claimOff(id: string, owner: string): Promise<Fence> {
    const row = await this.settleCompletedOff(await this.ensure(id));
    if (offBlocked(row)) throw new OperationError("Satu protective OFF masih pending/belum pasti. Periksa operasi tersebut terlebih dahulu.");
    const operationId = randomUUID();
    const result = await this.budget.wait(this.db.adsterraCampaignOperation.updateMany({
      where: { campaignId: row.campaignId, protectiveOffGeneration: row.protectiveOffGeneration,
        protectiveOffStatus: row.protectiveOffStatus, protectiveOffUncertain: false },
      data: { protectiveOffId: operationId, protectiveOffGeneration: { increment: 1 }, protectiveOffStatus: "RUNNING",
        protectiveOffOwner: owner, protectiveOffAt: new Date(this.budget.now()), protectiveOffSummary: null },
    }));
    if (result.count !== 1) throw new OperationError("Protective OFF diklaim proses lain.");
    return { campaignId: row.campaignId, operationId, generation: row.protectiveOffGeneration + 1, protective: true };
  }
  private async settleCompletedOff(row: OperationRow) {
    if (!settledOffEvidence(row)) return row;
    // The ended OFF pipeline explicitly recorded settled transport. The same
    // activation has now ended durably too. Fence BOTH observations atomically;
    // never release an uncertain request or infer completion from a provider GET.
    const changed = await this.budget.wait(this.db.adsterraCampaignOperation.updateMany({ where: {
      campaignId: row.campaignId, operationId: row.operationId, generation: row.generation, action: row.action,
      status: row.status, phase: row.phase, uncertain: false,
      protectiveOffId: row.protectiveOffId, protectiveOffGeneration: row.protectiveOffGeneration,
      protectiveOffStatus: "UNVERIFIED", protectiveOffUncertain: false, protectiveOffSummary: row.protectiveOffSummary,
    }, data: { protectiveOffStatus: "PARTIAL", protectiveOffGeneration: { increment: 1 } } }));
    if (changed.count !== 1) throw new OperationError("Catatan OFF berubah; tidak membuka pengaman operasi lain. Periksa Status.");
    const fresh = await this.read(row.campaignId);
    if (!fresh) throw new OperationError("Catatan operasi belum dapat dibaca.");
    return fresh;
  }
  private async update(f: Fence, data: Parameters<PrismaClient["adsterraCampaignOperation"]["updateMany"]>[0]["data"], status = "RUNNING") {
    const changed = await this.budget.wait(this.db.adsterraCampaignOperation.updateMany({ where: {
      campaignId: f.campaignId, operationId: f.operationId, generation: f.generation, status,
    }, data }));
    if (changed.count !== 1) throw new OperationError("Fencing operasi berubah. Hasil tidak menimpa operasi lain.");
  }
  private async updateOff(f: Fence, data: Parameters<PrismaClient["adsterraCampaignOperation"]["updateMany"]>[0]["data"]) {
    const changed = await this.budget.wait(this.db.adsterraCampaignOperation.updateMany({ where: {
      campaignId: f.campaignId, protectiveOffId: f.operationId, protectiveOffGeneration: f.generation, protectiveOffStatus: "RUNNING",
    }, data }));
    if (changed.count !== 1) throw new OperationError("Fencing protective OFF berubah.");
  }
}
