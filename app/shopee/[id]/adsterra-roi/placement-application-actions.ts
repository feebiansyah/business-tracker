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
    const result = await executeApplication(ctx, owner, data, token, (at, fence, method, result) => finalizeAdsterraApplication(prisma, fence, ctx.scope, method, result, at, budget));
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
