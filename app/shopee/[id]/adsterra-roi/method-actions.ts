"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { parseAdsterraConfigId, parseShopeeAccountId } from "@/lib/adsterra-roi/config-input";
import { campaignKey, digest } from "@/lib/adsterra-operations/canonical";
import { OperationBudget } from "@/lib/adsterra-operations/budget";
import { CampaignOperationStore } from "@/lib/adsterra-operations/repository";
import { operationContext, parseListKind, publicOperationError, requireOperationUser } from "@/lib/adsterra-operations/runtime";
import { prepareMethod, executeMethod } from "@/lib/adsterra-operations/method-service";
import { verifyConfirmation } from "@/lib/adsterra-operations/confirmation";

export async function getAdsterraApplicationMethod(account: unknown, config: unknown) {
  const budget = new OperationBudget(); await requireOperationUser(budget);
  try {
    const shopeeAccountId = parseShopeeAccountId(account), configId = parseAdsterraConfigId(config);
    const row = await budget.wait(prisma.adsterraCampaignConfig.findFirst({ where: { id: configId, shopeeAccountId }, select: { campaignId: true } }));
    if (!row) throw new Error("SCOPE");
    const method = await new CampaignOperationStore(prisma, budget).method(campaignKey(row.campaignId));
    return { success: true as const, method, campaignId: campaignKey(row.campaignId) };
  } catch { return { success: false as const, message: "Metode aplikasi belum dapat dibaca. Periksa scope/penyimpanan/migrasi; ini bukan berarti Belum ditetapkan." }; }
}
export async function prepareAdsterraMethod(account: unknown, config: unknown, kind: unknown) {
  const budget = new OperationBudget(), owner = await requireOperationUser(budget);
  try { return { success: true as const, preview: await prepareMethod(await operationContext(account, config, budget), owner, parseListKind(kind)) }; }
  catch (error) { return { success: false as const, message: publicOperationError(error) }; }
}
export async function executeAdsterraMethod(account: unknown, config: unknown, token: unknown) {
  const budget = new OperationBudget(), owner = await requireOperationUser(budget);
  try {
    const ctx = await operationContext(account, config, budget);
    const result = await executeMethod(ctx, owner, token);
    revalidatePath(`/shopee/${ctx.scope.shopeeAccountId}/adsterra-roi`);
    return { success: true as const, result };
  } catch (error) { return { success: false as const, message: publicOperationError(error) }; }
}
export async function cancelAdsterraMethod(account: unknown, config: unknown, token: unknown) {
  const budget = new OperationBudget(), owner = await requireOperationUser(budget);
  try {
    const ctx = await operationContext(account, config, budget), signed = verifyConfirmation(token, owner, "ADSTERRA_METHOD_SET_V1", budget.now());
    if (signed.campaignId !== ctx.scope.campaignId || signed.configId !== ctx.scope.configId || signed.shopeeAccountId !== ctx.scope.shopeeAccountId) throw new Error("SCOPE");
    await ctx.store.cancel({ campaignId: signed.campaignId, operationId: signed.operationId, generation: signed.generation }, owner, digest(token));
    return { success: true as const };
  } catch (error) { return { success: false as const, message: publicOperationError(error) }; }
}
