import { randomUUID } from "node:crypto";
import type { PrismaClient, AdsterraCampaignOperation } from "../generated/prisma/client";
import { campaignKey } from "./canonical";
import { OperationError } from "./types";
import type { OperationBudget } from "./budget";
import type { ListKind, MethodState } from "./types";
import { storedMethod, listDigest } from "./method-state";
import { retainFailureSummary } from "./diagnostics";

export type OperationRow = AdsterraCampaignOperation;
export type Fence = { campaignId: string; operationId: string; generation: number; protective?: boolean };
export type WriteMarker = { readonly fence: Fence; readonly phase: string };
export class MarkerPersistenceUncertain extends OperationError {}
const terminal = ["IDLE", "VERIFIED", "NO_CHANGE", "RECONFIRM_REQUIRED"];
const offTerminal = [...terminal, "PARTIAL"];
// FINISHED is written only after the pipeline returns. A settled rejection is
// not an in-flight request. Never extend this to RUNNING or UNVERIFIED.
const completedFailure = (r: OperationRow) => r.status === "PARTIAL" && ["FINISHED", "NOT_DISPATCHED"].includes(r.phase) && !r.uncertain;
export const offBlocked = (r: OperationRow) => !offTerminal.includes(r.protectiveOffStatus) || r.protectiveOffUncertain;
const available = (r: OperationRow, now: number) => !r.uncertain && !offBlocked(r)
  && (terminal.includes(r.status) || completedFailure(r) || (r.status === "PREPARED" && !!r.expiresAt && r.expiresAt.getTime() <= now));

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
  async finalizeMethod(f: Fence, expected: MethodState, kind: ListKind, ready: boolean, lists: { blacklist: string[]; whitelist: string[] }, expiresAt = Infinity) {
    const previous = await this.assert(f);
    if (this.budget.now() >= expiresAt) throw new OperationError("Konfirmasi berakhir sebelum penyimpanan metode.");
    const changed = await this.budget.wait(this.db.adsterraCampaignOperation.updateMany({ where: {
      campaignId: f.campaignId, operationId: f.operationId, generation: f.generation, status: "RUNNING", uncertain: false, ...expected,
      protectiveOffStatus: { in: offTerminal }, protectiveOffUncertain: false,
    }, data: { placementMethod: kind, methodReady: ready, approvedBlacklistHash: listDigest(lists.blacklist),
      approvedWhitelistHash: listDigest(lists.whitelist), status: "VERIFIED", phase: "METHOD_CONFIRMED",
      summary: retainFailureSummary(previous.summary, JSON.stringify({ v: 1, status: "VERIFIED", phase: "METHOD_FINALIZE", metadata: "RECORDED", diagnostics: [] })) } }));
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
  async reserve(id: string, owner: string, action: string, prepared?: { preconditionHash: string; expiresAt: Date }) {
    const row = await this.ensure(id);
    if (!available(row, this.budget.now())) throw new OperationError("Perubahan campaign masih berjalan atau hasilnya belum pasti. Periksa Status; jangan mengulang write.");
    const operationId = randomUUID();
    const result = await this.budget.wait(this.db.adsterraCampaignOperation.updateMany({
      where: { campaignId: row.campaignId, operationId: row.operationId, generation: row.generation, status: row.status,
        uncertain: false, protectiveOffGeneration: row.protectiveOffGeneration, protectiveOffStatus: row.protectiveOffStatus, protectiveOffUncertain: false },
      data: { operationId, generation: { increment: 1 }, owner, action, phase: prepared ? "CONFIRMATION" : "PREFLIGHT",
        status: prepared ? "PREPARED" : "RUNNING", uncertain: false,
        confirmationHash: null, preconditionHash: prepared?.preconditionHash ?? null,
        expiresAt: prepared?.expiresAt ?? null, startedAt: new Date(this.budget.now()) },
    }));
    if (result.count !== 1) throw new OperationError("Campaign diklaim proses lain. Muat ulang sebelum melanjutkan.");
    return { campaignId: row.campaignId, operationId, generation: row.generation + 1 } satisfies Fence;
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
    else await this.update(f, { status: actualStatus, phase: "FINISHED", summary: retainFailureSummary(row?.summary ?? null, summary) });
    return actualStatus;
  }
  async finishNotDispatched(f: Fence, status: "PARTIAL" | "RECONFIRM_REQUIRED", summary: string) {
    // The provider has already awaited BOTH receipt-based settlement writes.
    // Preserve proof/evidence without re-opening any RUNNING/uncertain request.
    const previous = await this.read(f.campaignId);
    const changed = await this.budget.settle(this.db.adsterraCampaignOperation.updateMany({ where: {
      campaignId: f.campaignId, operationId: f.operationId, generation: f.generation,
      status, phase: "NOT_DISPATCHED", uncertain: false,
    }, data: { phase: "FINISHED", summary: retainFailureSummary(previous?.summary ?? null, summary) } }));
    if (changed.count !== 1) throw new OperationError("Pencatatan non-dispatch berubah; tidak menimpa operasi lain.");
  }
  async claimOff(id: string, owner: string): Promise<Fence> {
    const row = await this.ensure(id);
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
  async recover(row: OperationRow, owner: string, summary: string) {
    if (row.uncertain || row.protectiveOffUncertain) throw new OperationError("Request lama belum terbukti selesai. GET yang cocok tidak dapat membuka guard.");
    const result = await this.budget.wait(this.db.adsterraCampaignOperation.updateMany({
      where: { campaignId: row.campaignId, operationId: row.operationId, generation: row.generation, status: row.status,
        uncertain: false, protectiveOffGeneration: row.protectiveOffGeneration, protectiveOffStatus: row.protectiveOffStatus, protectiveOffUncertain: false },
      data: { operationId: randomUUID(), generation: { increment: 1 }, owner, action: "RECOVER", status: "VERIFIED", phase: "ACKNOWLEDGED_CURRENT",
        methodVersion: { increment: 1 }, methodReady: false,
        confirmationHash: null, expiresAt: null, summary: summary.slice(0, 2000), protectiveOffId: null,
        protectiveOffGeneration: { increment: 1 }, protectiveOffStatus: "VERIFIED", protectiveOffSummary: "Diakui operator; tidak ada write/retry provider." },
    }));
    if (result.count !== 1) throw new OperationError("Keadaan operasi berubah; konfirmasi pemulihan ulang.");
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
