import type { PrismaClient } from "../generated/prisma/client";
import type { OperationBudget } from "./budget";
import type { Fence } from "./repository";
import type { Scope } from "./types";
import { OperationError } from "./types";
import { campaignKey } from "./canonical";

/** Short DB-only transaction: lock the same fence used by recovery/config edits. */
export async function recordAdsterraBlacklistTimestamp(db: Pick<PrismaClient, "$transaction">,
  fence: Fence, scope: Scope, at: Date, budget: OperationBudget) {
  if (fence.protective || campaignKey(scope.campaignId) !== fence.campaignId) throw new OperationError("Scope metadata berbeda dari operasi blacklist.");
  budget.check();
  await budget.wait(db.$transaction(async (tx) => {
    budget.check();
    const owned = await tx.adsterraCampaignOperation.updateMany({ where: {
      campaignId: fence.campaignId, operationId: fence.operationId, generation: fence.generation,
      status: "RUNNING", action: "APPLY_BLACKLIST", uncertain: false,
    }, data: { phase: "RECORD_METADATA" } });
    if (owned.count !== 1) throw new OperationError("Fencing metadata berubah; timestamp lama tidak dicatat.");
    budget.check();
    const config = await tx.adsterraCampaignConfig.findFirst({ where: { id: scope.configId, shopeeAccountId: scope.shopeeAccountId }, select: { campaignId: true } });
    if (!config || campaignKey(config.campaignId) !== fence.campaignId) throw new OperationError("Campaign fisik konfigurasi metadata sudah berubah.");
    budget.check();
    const changed = await tx.adsterraCampaignConfig.updateMany({ where: {
      id: scope.configId, shopeeAccountId: scope.shopeeAccountId, campaignId: config.campaignId,
    }, data: { lastBlacklistReplacedAt: at } });
    if (changed.count !== 1) throw new OperationError("Scope metadata berubah; timestamp tidak dicatat.");
    budget.check();
  }, { isolationLevel: "Serializable", maxWait: Math.min(5000, budget.remaining()), timeout: Math.min(5000, budget.remaining()) }));
}
