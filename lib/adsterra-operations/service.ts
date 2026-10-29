import type { operationContext } from "./runtime";
import { digest } from "./canonical";
import { signConfirmation, verifyConfirmation } from "./confirmation";
import { applyPlacementPlan, preconditionHash } from "./application";
import { OperationError, type ApplicationResult, type Confirmation, type ListKind, type MethodState, type Preview } from "./types";
import type { Fence } from "./repository";

type Context = Awaited<ReturnType<typeof operationContext>>;
export async function prepareApplication(ctx: Context, owner: string, data: FormData, kind: ListKind): Promise<Preview> {
  const method = await ctx.store.method(ctx.scope.campaignId);
  if (!method.placementMethod || method.placementMethod !== kind) throw new OperationError("Tetapkan metode di Campaign. Jenis dari browser tidak boleh mengganti metode tersimpan.");
  const plan = await ctx.plan(data, kind);
  const expiresAt = ctx.budget.now() + 300_000;
  let token = "";
  if (!plan.blockers.length) {
    const fence = await ctx.store.reserve(ctx.scope.campaignId, owner, `APPLY_${kind}`, { preconditionHash: plan.preconditionHash, expiresAt: new Date(expiresAt) });
    const confirmation: Confirmation = { ...fence, owner, ...ctx.scope, kind, purpose: "ADSTERRA_LIST_APPLY_V2", methodVersion: plan.before.method.methodVersion,
      inputHash: plan.inputHash, preconditionHash: plan.preconditionHash, rules: "ROI20_OR_10_CTR8_SPEND1000_V1", expiresAt };
    token = signConfirmation(confirmation);
    await ctx.store.attachConfirmation(fence, digest(token));
  }
  const { before, inputHash: _input, preconditionHash: _precondition, ...visible } = plan;
  void _input; void _precondition;
  return { ...visible, token, expiresAt: new Date(expiresAt).toISOString(), currentBlacklist: before.blacklist, currentWhitelist: before.whitelist,
    providerStatus: ["", "INACTIVE", "LIMITED", "ACTIVE", "NOT_IN_USE"][before.campaign.active], autoEnabledAliases: before.aliases.filter((a) => a.autoScheduleEnabled).map((a) => a.id) };
}
export async function executeApplication(ctx: Context, owner: string, data: FormData, token: unknown,
  finalize: (at: Date, fence: Fence, method: MethodState, result: ApplicationResult) => Promise<{ lastBlacklistReplacedAt: string | null }>): Promise<ApplicationResult> {
  const signed = verifyConfirmation(token, owner, "ADSTERRA_LIST_APPLY_V2", ctx.budget.now());
  if (signed.configId !== ctx.scope.configId || signed.shopeeAccountId !== ctx.scope.shopeeAccountId || signed.campaignId !== ctx.scope.campaignId) throw new OperationError("Scope konfirmasi berbeda.");
  const fence = { campaignId: signed.campaignId, operationId: signed.operationId, generation: signed.generation };
  await ctx.store.claim(fence, owner, digest(token), signed.expiresAt);
  ctx.provider.fence = fence; ctx.provider.expiresAt = signed.expiresAt;
  let result: ApplicationResult;
  let invalidated: MethodState | null = null;
  try {
    const plan = await ctx.plan(data, signed.kind);
    if (plan.blockers.length || plan.before.method.methodVersion !== signed.methodVersion || plan.inputHash !== signed.inputHash || plan.preconditionHash !== signed.preconditionHash) {
      result = { status: "RECONFIRM_REQUIRED", phase: "PREFLIGHT", message: "Analisis/input/daftar/status/bid/Auto berubah. Konfirmasi ulang, tanpa mutasi provider.", actual: null, writeWarnings: [], metadata: "NOT_REQUIRED" };
    } else {
      if (ctx.budget.now() >= signed.expiresAt) throw new OperationError("Konfirmasi kedaluwarsa selama preflight; tidak mengubah kesiapan atau provider.");
      invalidated = await ctx.store.invalidateMethod(fence, plan.before.method);
      ctx.bindMethod(invalidated, true);
      const before = { ...plan.before, method: invalidated };
      result = await applyPlacementPlan({ ...plan, before, preconditionHash: preconditionHash(before, plan.target, plan.kind) }, ctx.provider, ctx.budget, ctx.snapshot);
    }
  } catch {
    result = { status: ctx.provider.sent ? "UNVERIFIED" : "RECONFIRM_REQUIRED", phase: "PREFLIGHT", message: "Preflight gagal/timeout. Konfirmasi tidak dapat dipakai ulang. Periksa keadaan operasi sebelum melanjutkan.", actual: null, writeWarnings: [], metadata: "NOT_REQUIRED" };
  }
  if (ctx.provider.notDispatchedStatus) {
    return { ...result, status: ctx.provider.notDispatchedStatus, phase: "NOT_DISPATCHED", metadata: "NOT_REQUIRED",
      message: ctx.provider.notDispatchedStatus === "PARTIAL"
        ? "Langkah terakhir terbukti belum dikirim dan marker diselesaikan. Langkah sebelumnya mungkin sudah berubah; periksa hasil parsial tanpa retry otomatis."
        : "HTTP write terbukti belum dimulai dan marker diselesaikan dengan fencing. Siapkan konfirmasi baru; tidak ada retry otomatis." };
  }
  if (["VERIFIED", "NO_CHANGE"].includes(result.status) && invalidated) {
    try {
      const metadata = await ctx.budget.wait(finalize(new Date(ctx.budget.now()), fence, invalidated, result));
      result.metadata = "RECORDED"; result.lastBlacklistReplacedAt = metadata.lastBlacklistReplacedAt;
      return result; // readiness + timestamp + guard were committed atomically
    } catch { result.metadata = "FAILED"; result.status = "PARTIAL"; result.message += " Finalisasi metadata/kesiapan gagal atau belum pasti; hasil provider tetap ditampilkan. Jangan ulangi write untuk memperbaiki metadata."; }
  }
  try { result.status = await ctx.store.finish(fence, result.status, JSON.stringify({ status: result.status, phase: result.phase, metadata: result.metadata, writes: ctx.provider.sent })) as ApplicationResult["status"]; }
  catch { result.metadata = "FAILED"; if (!["PARTIAL", "UNVERIFIED"].includes(result.status)) result.status = "UNVERIFIED"; result.message += " Pencatatan hasil operasi gagal; guard mungkin tetap RUNNING. Jangan retry provider."; }
  return result;
}
