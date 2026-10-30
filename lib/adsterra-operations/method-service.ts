import type { operationContext } from "./runtime";
import { digest } from "./canonical";
import { preconditionHash } from "./application";
import { planMethod, type MethodPreview } from "./method-plan";
import { signConfirmation, verifyConfirmation } from "./confirmation";
import { OperationError, type ApplicationResult, type Confirmation, type ListKind } from "./types";
import { diagnosticSummary } from "./diagnostics";

type Context = Awaited<ReturnType<typeof operationContext>>;
export async function prepareMethod(ctx: Context, owner: string, kind: ListKind): Promise<MethodPreview> {
  const plan = planMethod(ctx.scope, await ctx.snapshot(), kind);
  const expiresAt = ctx.budget.now() + 300_000;
  let token = "";
  if (!plan.blockers.length) {
    const fence = await ctx.store.reserve(ctx.scope.campaignId, owner, "SET_METHOD", { preconditionHash: plan.preconditionHash, expiresAt: new Date(expiresAt) });
    const signed: Confirmation = { ...fence, ...ctx.scope, owner, kind, purpose: "ADSTERRA_METHOD_SET_V2", methodVersion: plan.before.method.methodVersion,
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
  const signed = verifyConfirmation(token, owner, "ADSTERRA_METHOD_SET_V2", ctx.budget.now());
  if (signed.campaignId !== ctx.scope.campaignId || signed.configId !== ctx.scope.configId || signed.shopeeAccountId !== ctx.scope.shopeeAccountId) throw new OperationError("Scope konfirmasi metode berbeda.");
  const fence = { campaignId: signed.campaignId, operationId: signed.operationId, generation: signed.generation };
  await ctx.store.claim(fence, owner, digest(token), signed.expiresAt);
  ctx.provider.fence = fence; ctx.provider.expiresAt = signed.expiresAt;
  const result: ApplicationResult = { status: "RECONFIRM_REQUIRED", phase: "METHOD_PREFLIGHT", message: "Prasyarat berubah; konfirmasi ulang tanpa mutasi provider.", actual: null, writeWarnings: [], metadata: "NOT_REQUIRED" };
  try {
    const plan = planMethod(ctx.scope, await ctx.snapshot(), signed.kind);
    if (!plan.blockers.length && plan.before.method.methodVersion === signed.methodVersion && plan.inputHash === signed.inputHash && plan.preconditionHash === signed.preconditionHash) {
      if (ctx.budget.now() >= signed.expiresAt) throw new OperationError("Konfirmasi metode kedaluwarsa selama preflight.");
      if (plan.same) {
        const after = await ctx.snapshot();
        if (preconditionHash(after, [], signed.kind) !== signed.preconditionHash) throw new OperationError("Keadaan berubah; pilih ulang metode.");
        result.status = "NO_CHANGE"; result.message = "Metode tetap sama. Daftar, status campaign, Auto dan Custom Bid tidak diubah.";
        result.actual = { blacklist: after.blacklist, whitelist: after.whitelist, bids: after.bids };
      } else {
        if (plan.reset) { ctx.budget.check(45_000); ctx.budget.requireRequests(32); }
        const invalidated = await ctx.store.invalidateMethod(fence, plan.before.method);
        ctx.bindMethod(invalidated);
        let expected = { ...plan.before, method: invalidated };
        const observe = async () => {
          const actual = await ctx.snapshot();
          result.actual = { blacklist: actual.blacklist, whitelist: actual.whitelist, bids: actual.bids };
          if (ctx.provider.ambiguous) throw new OperationError("Hasil perubahan belum pasti; tidak meneruskan reset.");
          if (preconditionHash(actual, [], signed.kind) !== preconditionHash(expected, [], signed.kind)) throw new OperationError("Daftar/bid/scope/prasyarat berubah. Hentikan dan konfirmasi ulang dari keadaan terbaru.");
          return actual;
        };
        if (plan.reset) {
          result.phase = "METHOD_DISABLE_AUTO";
          if (expected.aliases.some((a) => a.autoScheduleEnabled)) expected = { ...expected, ...await ctx.disableAuto(fence, expected) };
          await observe();
          result.phase = "METHOD_OFF";
          if (expected.campaign.active !== 1) {
            try { await ctx.provider.legacy.setCampaignActive(ctx.scope.campaignId, false); }
            catch { result.writeWarnings.push("OFF belum memberi bukti sukses; diperiksa lewat GET, tanpa mengulang write."); }
            const campaign = await ctx.provider.campaign();
            if (ctx.provider.ambiguous || campaign.active !== 1 || campaign.pricing !== expected.campaign.pricing) throw new OperationError("OFF belum terverifikasi INACTIVE; daftar tidak dikosongkan.");
            expected = { ...expected, campaign };
          }
          ctx.provider.requireInactive = true;
          await observe();
          for (const kind of ["BLACKLIST", "WHITELIST"] as const) {
            const key = kind === "BLACKLIST" ? "blacklist" : "whitelist";
            if (!expected[key].length) continue;
            result.phase = kind === "BLACKLIST" ? "CLEAR_BLACKLIST" : "CLEAR_WHITELIST";
            ctx.budget.check(30_000);
            try { await ctx.provider.clear(kind); }
            catch { result.writeWarnings.push(`Clear ${kind} diperiksa melalui GET; tidak ada retry atau rollback.`); }
            expected = { ...expected, [key]: [] };
            await observe();
          }
        }
        result.phase = "METHOD_VERIFY";
        const after = await observe();
        result.phase = "METHOD_FINALIZE";
        try {
          if (ctx.budget.now() >= signed.expiresAt) throw new OperationError("Konfirmasi metode kedaluwarsa sebelum finalisasi; metode baru tidak diterbitkan.");
          await ctx.store.finalizeMethod(fence, invalidated, signed.kind, plan.adopt || (plan.reset && signed.kind === "BLACKLIST"), after, signed.expiresAt);
          return { ...result, status: "VERIFIED", metadata: "RECORDED", writeWarnings: [...result.writeWarnings, ...ctx.provider.warnings], message: plan.adopt
            ? "Metode tersimpan; daftar existing dipertahankan. Tidak ada write provider atau perubahan Custom Bid."
            : signed.kind === "WHITELIST" ? "Metode Whitelist tersimpan. Whitelist belum diisi; terapkan analisis Placement sebelum ON. Custom Bid dipertahankan."
            : "Metode Blacklist tersimpan. Campaign dan seluruh Auto nonaktif; kedua daftar kosong terverifikasi. Tidak ada placement yang dikecualikan. Custom Bid dipertahankan." };
        } catch { result.status = "UNVERIFIED"; result.metadata = "FAILED"; result.message = "Finalisasi metode/guard gagal atau belum pasti. Jangan ulangi provider write; periksa keadaan operasi."; }
      }
    }
  } catch {
    result.status = ctx.provider.ambiguous ? "UNVERIFIED" : ctx.provider.sent ? "PARTIAL" : "RECONFIRM_REQUIRED";
    result.message = ctx.provider.ambiguous ? "Hasil perubahan belum pasti. Periksa Status; jangan ulangi write."
      : "Perubahan belum selesai. Keadaan terbaru harus diperiksa pada konfirmasi baru; tidak ada rollback atau pengulangan write otomatis.";
  }
  result.writeWarnings.push(...ctx.provider.warnings);
  result.diagnostics = [...ctx.provider.diagnostics]; result.writes = ctx.provider.sent;
  if (ctx.provider.notDispatchedStatus) {
    result.status = ctx.provider.notDispatchedStatus;
    result.message = "Langkah terakhir tidak dikirim. Buat konfirmasi baru dari keadaan terbaru; tidak ada retry otomatis.";
    try { await ctx.store.finishNotDispatched(fence, ctx.provider.notDispatchedStatus, diagnosticSummary(result, ctx.provider.sent)); }
    catch { result.metadata = "FAILED"; result.status = "UNVERIFIED"; result.message += " Pencatatan hasil belum terverifikasi; Periksa Status."; }
    return result;
  }
  try { result.status = await ctx.store.finish(fence, result.status, diagnosticSummary(result, ctx.provider.sent)) as ApplicationResult["status"]; }
  catch { result.metadata = "FAILED"; result.status = "UNVERIFIED"; result.message += " Pencatatan hasil juga belum pasti; operasi mungkin tetap terkunci."; }
  return result;
}
