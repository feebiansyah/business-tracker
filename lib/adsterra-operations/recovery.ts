import type { operationContext } from "./runtime";
import { digest } from "./canonical";
import { bidDigest } from "./application";
import { signConfirmation, verifyConfirmation } from "./confirmation";
import { OperationError, type Confirmation } from "./types";

type Context = Awaited<ReturnType<typeof operationContext>>;
export async function recoveryPreview(ctx: Context, owner: string) {
  const row = await ctx.store.read(ctx.scope.campaignId);
  if (!row) throw new OperationError("Belum ada operasi campaign untuk dipulihkan.");
  const snapshot = await ctx.snapshot();
  const blockers: string[] = [];
  if (row.uncertain || row.protectiveOffUncertain) blockers.push("Ada request lama/DB pending yang belum terbukti selesai. GET cocok tidak membuka guard; pemulihan ini tetap diblokir. Protective OFF dan penonaktifan Auto tetap tersedia jika slot OFF belum pending.");
  if (snapshot.campaign.active !== 1) blockers.push("Pemulihan memerlukan provider strictly INACTIVE.");
  if (snapshot.aliases.some((a) => a.autoScheduleEnabled)) blockers.push("Nonaktifkan Auto pada semua alias sebelum pemulihan.");
  const expiresAt = ctx.budget.now() + 300_000;
  const signed: Confirmation = { purpose: "ADSTERRA_LIST_RECOVER_V2", owner, operationId: row.operationId, generation: row.generation, methodVersion: snapshot.method.methodVersion,
    ...ctx.scope, kind: "BLACKLIST", inputHash: digest(row), preconditionHash: digest({ ...snapshot, bids: bidDigest(snapshot.bids) }),
    rules: "ROI20_OR_10_CTR8_SPEND1000_V1", expiresAt };
  return { token: blockers.length ? "" : signConfirmation(signed), expiresAt: new Date(expiresAt).toISOString(),
    campaignId: ctx.scope.campaignId, status: row.status, phase: row.phase, protectiveOffStatus: row.protectiveOffStatus,
    blockers, blacklist: snapshot.blacklist, whitelist: snapshot.whitelist, bidCount: snapshot.bids.length,
    message: "Pemulihan mengakui snapshot, mengganti generation/versi dan menonaktifkan kesiapan. Tidak menetapkan metode atau menyelesaikan pergantian; konfirmasi baru diperlukan. Tidak mengulang write/memulihkan bid atau membuktikan request lama berhenti." };
}
export async function acknowledgeRecovery(ctx: Context, owner: string, token: unknown) {
  const signed = verifyConfirmation(token, owner, "ADSTERRA_LIST_RECOVER_V2", ctx.budget.now());
  if (signed.campaignId !== ctx.scope.campaignId || signed.configId !== ctx.scope.configId || signed.shopeeAccountId !== ctx.scope.shopeeAccountId) throw new OperationError("Scope pemulihan berbeda.");
  const row = await ctx.store.read(ctx.scope.campaignId), snapshot = await ctx.snapshot();
  if (!row || digest(row) !== signed.inputHash || digest({ ...snapshot, bids: bidDigest(snapshot.bids) }) !== signed.preconditionHash) throw new OperationError("Operasi/daftar berubah. Konfirmasi ulang pemulihan.");
  if (snapshot.campaign.active !== 1 || snapshot.aliases.some((a) => a.autoScheduleEnabled)) throw new OperationError("Prasyarat pemulihan berubah.");
  if (ctx.budget.now() >= signed.expiresAt) throw new OperationError("Konfirmasi pemulihan kedaluwarsa.");
  await ctx.store.recover(row, owner, "Operator mengakui snapshot aktual; tidak ada retry/write provider atau bid restoration.");
  return { status: "VERIFIED" as const, message: "Snapshot diakui; generation/versi diganti dan kesiapan false. Tidak ada write provider/penetapan metode; konfirmasi penerapan baru diperlukan." };
}
