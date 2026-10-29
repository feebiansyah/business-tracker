import type { PrismaClient } from "../generated/prisma/client";
import type { OperationBudget } from "./budget";
import type { Fence } from "./repository";
import type { ApplicationResult, MethodState, Scope } from "./types";
import { OperationError } from "./types";
import { campaignKey } from "./canonical";
import { listDigest } from "./method-state";
import { diagnosticSummary } from "./diagnostics";

/** Short DB-only transaction: lock the same fence used by recovery/config edits. */
export async function finalizeAdsterraApplication(db: Pick<PrismaClient, "$transaction">,
  fence: Fence, scope: Scope, method: MethodState, result: ApplicationResult, at: Date, budget: OperationBudget) {
  if (fence.protective || campaignKey(scope.campaignId) !== fence.campaignId) throw new OperationError("Scope metadata berbeda dari operasi blacklist.");
  if (!method.placementMethod || !result.actual || !["VERIFIED", "NO_CHANGE"].includes(result.status)
    || (method.placementMethod === "WHITELIST" && !result.actual.whitelist.length)
    || (method.placementMethod === "BLACKLIST" ? result.actual.whitelist.length : result.actual.blacklist.length)) throw new OperationError("Bukti finalisasi kesiapan tidak lengkap.");
  const actual = result.actual;
  const recordTimestamp = method.placementMethod === "BLACKLIST" && result.status === "VERIFIED";
  budget.check();
  await budget.wait(db.$transaction(async (tx) => {
    budget.check();
    const owned = await tx.adsterraCampaignOperation.updateMany({ where: {
      campaignId: fence.campaignId, operationId: fence.operationId, generation: fence.generation,
      status: "RUNNING", action: `APPLY_${method.placementMethod}`, uncertain: false, ...method,
      protectiveOffStatus: { in: ["IDLE", "VERIFIED", "NO_CHANGE", "RECONFIRM_REQUIRED"] }, protectiveOffUncertain: false,
    }, data: { phase: "RECORD_METADATA" } });
    if (owned.count !== 1) throw new OperationError("Fencing metadata berubah; timestamp lama tidak dicatat.");
    budget.check();
    const config = await tx.adsterraCampaignConfig.findFirst({ where: { id: scope.configId, shopeeAccountId: scope.shopeeAccountId }, select: { campaignId: true } });
    if (!config || campaignKey(config.campaignId) !== fence.campaignId) throw new OperationError("Campaign fisik konfigurasi metadata sudah berubah.");
    budget.check();
    if (recordTimestamp) {
      const changed = await tx.adsterraCampaignConfig.updateMany({ where: {
        id: scope.configId, shopeeAccountId: scope.shopeeAccountId, campaignId: config.campaignId,
      }, data: { lastBlacklistReplacedAt: at } });
      if (changed.count !== 1) throw new OperationError("Scope metadata berubah; timestamp tidak dicatat.");
    }
    const finished = await tx.adsterraCampaignOperation.updateMany({ where: {
      campaignId: fence.campaignId, operationId: fence.operationId, generation: fence.generation,
      status: "RUNNING", uncertain: false, ...method,
    }, data: { methodReady: true, approvedBlacklistHash: listDigest(actual.blacklist), approvedWhitelistHash: listDigest(actual.whitelist),
      status: result.status, phase: "FINISHED", summary: diagnosticSummary({ ...result, metadata: "RECORDED" }, result.writes ?? 0) } });
    if (finished.count !== 1) throw new OperationError("Fencing finalisasi berubah; kesiapan dan metadata tidak dicatat.");
    budget.check();
  }, { isolationLevel: "Serializable", maxWait: Math.min(5000, budget.remaining()), timeout: Math.min(5000, budget.remaining()) }));
  return { lastBlacklistReplacedAt: recordTimestamp ? at.toISOString() : null };
}
