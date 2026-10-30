"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { finalizeAdsterraApplication } from "@/lib/adsterra-operations/metadata";
import { OperationBudget } from "@/lib/adsterra-operations/budget";
import { operationContext, parseListKind, publicOperationError, requireOperationUser } from "@/lib/adsterra-operations/runtime";
import { prepareApplication, executeApplication } from "@/lib/adsterra-operations/service";
import { recoveryPreview, acknowledgeRecovery } from "@/lib/adsterra-operations/recovery";
import { verifyConfirmation } from "@/lib/adsterra-operations/confirmation";
import { digest } from "@/lib/adsterra-operations/canonical";
import { readDiagnostics } from "@/lib/adsterra-operations/diagnostics";

/** Observation only: never acknowledges recovery, releases uncertainty or retries. */
export async function inspectAdsterraOperation(accountId: unknown, configId: unknown) {
  const budget = new OperationBudget(); await requireOperationUser(budget);
  try {
    const ctx = await operationContext(accountId, configId, budget), row = await ctx.store.read(ctx.scope.campaignId);
    const pending = !!row && (row.uncertain || row.protectiveOffUncertain || ["RUNNING", "UNVERIFIED"].includes(row.status) || ["RUNNING", "UNVERIFIED"].includes(row.protectiveOffStatus));
    let actual = null;
    try { const s = await ctx.snapshot(); actual = { active: s.campaign.active, blacklist: s.blacklist.length, whitelist: s.whitelist.length, bids: s.bids.length }; } catch { /* Unknown is never zero. */ }
    return { success: true as const, result: { campaignId: ctx.scope.campaignId, pending, actual, readAt: new Date().toISOString(), origin: readDiagnostics(row?.summary ?? null),
      message: pending ? "Perubahan masih berjalan atau hasil write belum pasti. Aktivasi ditahan; tidak ada retry otomatis."
        : row?.status === "PARTIAL" ? "Permintaan sebelumnya sudah selesai tetapi belum diterapkan penuh. Anda dapat membuat konfirmasi baru dari keadaan aktual."
        : "Tidak ada request write yang tercatat belum pasti.", } };
  } catch (error) { return { success: false as const, message: publicOperationError(error) }; }
}

export async function prepareAdsterraPlacementApplication(accountId: unknown, data: FormData, kind: unknown) {
  const budget = new OperationBudget(), owner = await requireOperationUser(budget);
  try {
    const ctx = await operationContext(accountId, data.get("configId"), budget);
    return { success: true as const, preview: await prepareApplication(ctx, owner, data, parseListKind(kind)) };
  } catch (error) { return { success: false as const, message: publicOperationError(error) }; }
}
export async function executeAdsterraPlacementApplication(accountId: unknown, data: FormData, token: unknown) {
  const budget = new OperationBudget(), owner = await requireOperationUser(budget);
  try {
    const ctx = await operationContext(accountId, data.get("configId"), budget);
    const result = await executeApplication(ctx, owner, data, token, (at, fence, method, result) => finalizeAdsterraApplication(prisma, fence, ctx.scope, method, result, at, budget, ctx.provider.expiresAt));
    revalidatePath(`/shopee/${ctx.scope.shopeeAccountId}/adsterra-roi`);
    return { success: true as const, result };
  } catch (error) { return { success: false as const, message: publicOperationError(error) }; }
}
export async function cancelAdsterraPlacementApplication(accountId: unknown, configId: unknown, token: unknown) {
  const budget = new OperationBudget(), owner = await requireOperationUser(budget);
  try {
    const ctx = await operationContext(accountId, configId, budget);
    const signed = verifyConfirmation(token, owner, "ADSTERRA_LIST_APPLY_V2", budget.now());
    if (signed.campaignId !== ctx.scope.campaignId || signed.configId !== ctx.scope.configId || signed.shopeeAccountId !== ctx.scope.shopeeAccountId) throw new Error("SCOPE");
    await ctx.store.cancel({ campaignId: signed.campaignId, operationId: signed.operationId, generation: signed.generation }, owner, digest(token));
    return { success: true as const };
  } catch (error) { return { success: false as const, message: publicOperationError(error) }; }
}
export async function prepareAdsterraOperationRecovery(accountId: unknown, configId: unknown) {
  const budget = new OperationBudget(), owner = await requireOperationUser(budget);
  try { return { success: true as const, preview: await recoveryPreview(await operationContext(accountId, configId, budget), owner) }; }
  catch (error) { return { success: false as const, message: publicOperationError(error) }; }
}
export async function confirmAdsterraOperationRecovery(accountId: unknown, configId: unknown, token: unknown) {
  const budget = new OperationBudget(), owner = await requireOperationUser(budget);
  try { return { success: true as const, result: await acknowledgeRecovery(await operationContext(accountId, configId, budget), owner, token) }; }
  catch (error) { return { success: false as const, message: publicOperationError(error) }; }
}
