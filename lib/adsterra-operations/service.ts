import type { operationContext } from "./runtime";
import { digest } from "./canonical";
import { signConfirmation, verifyConfirmation } from "./confirmation";
import { applyPlacementPlan } from "./application";
import { OperationError, type ApplicationResult, type Confirmation, type ListKind, type Preview } from "./types";

type Context = Awaited<ReturnType<typeof operationContext>>;
export async function prepareApplication(ctx: Context, owner: string, data: FormData, kind: ListKind): Promise<Preview> {
  const plan = await ctx.plan(data, kind);
  const expiresAt = ctx.budget.now() + 300_000;
  let token = "";
  if (!plan.blockers.length) {
    const fence = await ctx.store.reserve(ctx.scope.campaignId, owner, `APPLY_${kind}`, { preconditionHash: plan.preconditionHash, expiresAt: new Date(expiresAt) });
    const confirmation: Confirmation = { ...fence, owner, ...ctx.scope, kind, purpose: "ADSTERRA_LIST_APPLY_V1",
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
  record: (at: Date) => Promise<unknown>): Promise<ApplicationResult> {
  const signed = verifyConfirmation(token, owner, "ADSTERRA_LIST_APPLY_V1", ctx.budget.now());
  if (signed.configId !== ctx.scope.configId || signed.shopeeAccountId !== ctx.scope.shopeeAccountId || signed.campaignId !== ctx.scope.campaignId) throw new OperationError("Scope konfirmasi berbeda.");
  const fence = { campaignId: signed.campaignId, operationId: signed.operationId, generation: signed.generation };
  await ctx.store.claim(fence, owner, digest(token), signed.expiresAt);
  ctx.provider.fence = fence; ctx.provider.expiresAt = signed.expiresAt;
  let result: ApplicationResult;
  try {
    const plan = await ctx.plan(data, signed.kind);
    if (plan.inputHash !== signed.inputHash || plan.preconditionHash !== signed.preconditionHash) {
      result = { status: "RECONFIRM_REQUIRED", phase: "PREFLIGHT", message: "Analisis/input/daftar/status/bid/Auto berubah. Konfirmasi ulang, tanpa mutasi provider.", actual: null, writeWarnings: [], metadata: "NOT_REQUIRED" };
    } else { ctx.provider.requireInactive = plan.opposite.length > 0; result = await applyPlacementPlan(plan, ctx.provider, ctx.budget, ctx.snapshot); }
  } catch {
    result = { status: ctx.provider.sent ? "UNVERIFIED" : "RECONFIRM_REQUIRED", phase: "PREFLIGHT", message: "Preflight gagal/timeout. Konfirmasi tidak dapat dipakai ulang. Periksa keadaan operasi sebelum melanjutkan.", actual: null, writeWarnings: [], metadata: "NOT_REQUIRED" };
  }
  if (result.status === "VERIFIED" && signed.kind === "BLACKLIST") {
    try { const at = new Date(ctx.budget.now()); await ctx.budget.wait(record(at)); result.metadata = "RECORDED"; result.lastBlacklistReplacedAt = at.toISOString(); }
    catch { result.metadata = "FAILED"; result.status = "PARTIAL"; result.message += " Pencatatan timestamp gagal; hasil provider tetap ditampilkan, jangan ulangi write untuk memperbaiki metadata."; }
  }
  try { result.status = await ctx.store.finish(fence, result.status, JSON.stringify({ status: result.status, phase: result.phase, metadata: result.metadata, writes: ctx.provider.sent })) as ApplicationResult["status"]; }
  catch { result.metadata = "FAILED"; if (!["PARTIAL", "UNVERIFIED"].includes(result.status)) result.status = "UNVERIFIED"; result.message += " Pencatatan hasil operasi gagal; guard mungkin tetap RUNNING. Jangan retry provider."; }
  return result;
}
