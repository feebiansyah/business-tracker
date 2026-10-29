import { randomUUID } from "node:crypto";
import type { PrismaClient, AdsterraCampaignOperation } from "../generated/prisma/client";
import { campaignKey } from "./canonical";
import { OperationError } from "./types";
import type { OperationBudget } from "./budget";

export type OperationRow = AdsterraCampaignOperation;
export type Fence = { campaignId: string; operationId: string; generation: number; protective?: boolean };
const terminal = ["IDLE", "VERIFIED", "NO_CHANGE", "RECONFIRM_REQUIRED"];
export const offBlocked = (r: OperationRow) => !terminal.includes(r.protectiveOffStatus) || r.protectiveOffUncertain;
const available = (r: OperationRow, now: number) => !r.uncertain && !offBlocked(r)
  && (terminal.includes(r.status) || (r.status === "PREPARED" && !!r.expiresAt && r.expiresAt.getTime() <= now));

export class CampaignOperationStore {
  constructor(private readonly db: Pick<PrismaClient, "adsterraCampaignOperation">, private readonly budget: OperationBudget) {}
  async read(id: string) { return this.budget.wait(this.db.adsterraCampaignOperation.findUnique({ where: { campaignId: campaignKey(id) } })); }
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
    if (!available(row, this.budget.now())) throw new OperationError(`Campaign memiliki operasi ${row.status}/${row.protectiveOffStatus}. Gunakan pemulihan eksplisit; jangan mengulang write.`);
    const operationId = randomUUID();
    const result = await this.budget.wait(this.db.adsterraCampaignOperation.updateMany({
      where: { campaignId: row.campaignId, operationId: row.operationId, generation: row.generation, status: row.status,
        uncertain: false, protectiveOffGeneration: row.protectiveOffGeneration, protectiveOffStatus: row.protectiveOffStatus, protectiveOffUncertain: false },
      data: { operationId, generation: { increment: 1 }, owner, action, phase: prepared ? "CONFIRMATION" : "PREFLIGHT",
        status: prepared ? "PREPARED" : "RUNNING", uncertain: false, summary: null,
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
        expiresAt: { gt: new Date(this.budget.now()) }, protectiveOffStatus: { in: terminal }, protectiveOffUncertain: false },
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
    if (f.protective) {
      await this.updateOff(f, { protectiveOffUncertain: true, protectiveOffSummary: phase });
    } else {
      const changed = await this.budget.wait(this.db.adsterraCampaignOperation.updateMany({
        where: { campaignId: f.campaignId, operationId: f.operationId, generation: f.generation, status: "RUNNING", uncertain: false,
          protectiveOffGeneration: row.protectiveOffGeneration, protectiveOffStatus: row.protectiveOffStatus, protectiveOffUncertain: false },
        data: { phase, uncertain: true },
      }));
      if (changed.count !== 1) throw new OperationError("Guard berubah sebelum dispatch. Write tidak dikirim.");
    }
    this.budget.check(); // a late DB result can never dispatch after the deadline
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
    else await this.update(f, { status: actualStatus, phase: "FINISHED", summary: summary.slice(0, 2000) });
    return actualStatus;
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
