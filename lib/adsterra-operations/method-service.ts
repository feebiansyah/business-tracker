import type { operationContext } from "./runtime";
import { digest } from "./canonical";
import { preconditionHash } from "./application";
import { planMethod, type MethodPreview } from "./method-plan";
import { signConfirmation, verifyConfirmation } from "./confirmation";
import { OperationError, type ApplicationResult, type Confirmation, type ListKind } from "./types";

type Context = Awaited<ReturnType<typeof operationContext>>;
export async function prepareMethod(ctx: Context, owner: string, kind: ListKind): Promise<MethodPreview> {
  const plan = planMethod(ctx.scope, await ctx.snapshot(), kind);
  const expiresAt = ctx.budget.now() + 300_000;
  let token = "";
  if (!plan.blockers.length) {
    const fence = await ctx.store.reserve(ctx.scope.campaignId, owner, "SET_METHOD", { preconditionHash: plan.preconditionHash, expiresAt: new Date(expiresAt) });
    const signed: Confirmation = { ...fence, ...ctx.scope, owner, kind, purpose: "ADSTERRA_METHOD_SET_V1", methodVersion: plan.before.method.methodVersion,
      inputHash: plan.inputHash, preconditionHash: plan.preconditionHash, rules: "ROI20_OR_10_CTR8_SPEND1000_V1", expiresAt };
    token = signConfirmation(signed);
    await ctx.store.attachConfirmation(fence, digest(token));
  }
  const { before, inputHash: _input, preconditionHash: _precondition, ...visible } = plan;
  void _input; void _precondition;
  return { ...visible, token, expiresAt: new Date(expiresAt).toISOString(), previousMethod: before.method.placementMethod,
    methodVersion: before.method.methodVersion, blacklist: before.blacklist, whitelist: before.whitelist, preservedBids: before.bids,
    providerStatus: ["", "INACTIVE", "LIMITED", "ACTIVE", "NOT_IN_USE"][before.campaign.active], autoEnabledAliases: before.aliases.filter((a) => a.autoScheduleEnabled).map((a) => a.id) };
}
export async function executeMethod(ctx: Context, owner: string, token: unknown): Promise<ApplicationResult> {
  const signed = verifyConfirmation(token, owner, "ADSTERRA_METHOD_SET_V1", ctx.budget.now());
  if (signed.campaignId !== ctx.scope.campaignId || signed.configId !== ctx.scope.configId || signed.shopeeAccountId !== ctx.scope.shopeeAccountId) throw new OperationError("Scope konfirmasi metode berbeda.");
  const fence = { campaignId: signed.campaignId, operationId: signed.operationId, generation: signed.generation };
  await ctx.store.claim(fence, owner, digest(token), signed.expiresAt);
  ctx.provider.fence = fence; ctx.provider.expiresAt = signed.expiresAt;
  const result: ApplicationResult = { status: "RECONFIRM_REQUIRED", phase: "METHOD_PREFLIGHT", message: "Prasyarat berubah; konfirmasi ulang tanpa mutasi provider.", actual: null, writeWarnings: [], metadata: "NOT_REQUIRED" };
  try {
    const plan = planMethod(ctx.scope, await ctx.snapshot(), signed.kind);
    if (!plan.blockers.length && plan.before.method.methodVersion === signed.methodVersion && plan.inputHash === signed.inputHash && plan.preconditionHash === signed.preconditionHash) {
      if (ctx.budget.now() >= signed.expiresAt) throw new OperationError("Konfirmasi metode kedaluwarsa selama preflight.");
      const invalidated = await ctx.store.invalidateMethod(fence, plan.before.method);
      ctx.bindMethod(invalidated);
      ctx.provider.requireInactive = plan.requiresInactive;
      const expected = { ...plan.before, method: invalidated, ...(signed.kind === "BLACKLIST" ? { whitelist: [] } : { blacklist: [] }) };
      if (plan.opposite.length) {
        result.phase = "METHOD_CLEAR_OPPOSITE";
        ctx.budget.check(35_000); ctx.budget.requireRequests(14);
        try { await ctx.provider.clear(signed.kind === "BLACKLIST" ? "WHITELIST" : "BLACKLIST"); }
        catch { result.writeWarnings.push("Clear tidak memberi bukti sukses; hanya GET berikutnya yang dinilai, tanpa retry write."); }
      }
      result.phase = "METHOD_VERIFY";
      const after = await ctx.snapshot();
      result.actual = { blacklist: after.blacklist, whitelist: after.whitelist, bids: after.bids };
      if (ctx.provider.notDispatchedStatus) {
        return { ...result, status: ctx.provider.notDispatchedStatus, message: "HTTP clear terbukti belum dikirim; metode lama dipertahankan, kesiapan false. Konfirmasi baru diperlukan." };
      }
      if (ctx.provider.ambiguous) {
        result.status = "UNVERIFIED"; result.message = "Clear mungkin diterapkan, tetapi request belum terbukti selesai. Metode baru/kesiapan tidak diterbitkan.";
      } else if (preconditionHash(after, [], signed.kind) !== preconditionHash(expected, [], signed.kind)
        || (plan.requiresInactive && (after.campaign.active !== 1 || after.aliases.some((a) => a.autoScheduleEnabled)))) {
        result.status = "PARTIAL"; result.message = "Kedua daftar/bid/scope/prasyarat belum cocok setelah clear. Tidak menyimpan metode baru atau melakukan rollback/reset bid.";
      } else {
        result.phase = "METHOD_FINALIZE";
        try {
          if (ctx.budget.now() >= signed.expiresAt) throw new OperationError("Konfirmasi metode kedaluwarsa sebelum finalisasi; metode baru tidak diterbitkan.");
          await ctx.store.finalizeMethod(fence, invalidated, signed.kind, plan.adopt, after);
          return { ...result, status: "VERIFIED", metadata: "RECORDED", writeWarnings: [...result.writeWarnings, ...ctx.provider.warnings], message: plan.adopt
            ? "Metode aplikasi diadopsi setelah konfirmasi dan verifikasi. Nol write provider/reset bid; bukan deteksi mode editor."
            : "Metode aplikasi ditetapkan sebagai Belum diterapkan. Lanjutkan ke Placement. Custom Bid dipertahankan; tidak ada ON/OFF otomatis." };
        } catch { result.status = "UNVERIFIED"; result.metadata = "FAILED"; result.message = "Finalisasi metode/guard gagal atau belum pasti. Jangan ulangi provider write; periksa keadaan operasi."; }
      }
    }
  } catch {
    result.status = ctx.provider.ambiguous ? "UNVERIFIED" : ctx.provider.sent ? "PARTIAL" : "RECONFIRM_REQUIRED";
    result.message = "Pembacaan/prasyarat/guard/timeout menghalangi penyelesaian. Kesiapan tidak dipulihkan otomatis; tidak ada retry write.";
  }
  result.writeWarnings.push(...ctx.provider.warnings);
  try { result.status = await ctx.store.finish(fence, result.status, JSON.stringify({ status: result.status, phase: result.phase, method: signed.kind, writes: ctx.provider.sent })) as ApplicationResult["status"]; }
  catch { result.metadata = "FAILED"; result.status = "UNVERIFIED"; result.message += " Pencatatan hasil juga belum pasti; operasi mungkin tetap terkunci."; }
  return result;
}
