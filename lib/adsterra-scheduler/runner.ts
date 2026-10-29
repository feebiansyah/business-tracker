import "server-only";
import { prisma } from "../prisma";
import { TrafficProvider } from "../generated/prisma/client";
import { getEncryptedTrafficCredential } from "../traffic-credentials/repository";
import { decryptTrafficSecret } from "../traffic-credentials/crypto";
import { getAdsterraClient } from "../adsterra-roi/config";
import { coordinatedCampaignActivity } from "../adsterra-operations/coordinated-writes";
import { OperationBudget } from "../adsterra-operations/budget";
import { claimAdsterraScheduleRun, finishAdsterraScheduleRun, loadEnabledAdsterraScheduleConfigs } from "./repository";
import { runAdsterraScheduledCampaigns as orchestrate, type AdsterraScheduledAction } from "./run";

export function runAdsterraScheduledCampaigns(action: AdsterraScheduledAction, now = new Date()) {
  return orchestrate(action, { now }, {
    loadEnabledConfigs: () => loadEnabledAdsterraScheduleConfigs(prisma),
    claimRun: (input) => claimAdsterraScheduleRun(prisma, input),
    finishRun: (input) => finishAdsterraScheduleRun(prisma, input),
    loadCredential: async (shopeeAccountId) => (await getEncryptedTrafficCredential(prisma, shopeeAccountId, TrafficProvider.ADSTERRA))?.encryptedSecret ?? null,
    createClient: (encryptedSecret) => getAdsterraClient(decryptTrafficSecret(encryptedSecret)),
    getCampaignStatus: (client, campaignId) => client.getCampaignStatus(campaignId),
    setAndVerify: (_client, _campaignId, desiredActive, config) => {
      if (!config) throw new Error("Scope scheduler belum terbukti.");
      // Re-read Auto flag and scope under the canonical physical-campaign claim.
      return coordinatedCampaignActivity(config.shopeeAccountId, config.id, "scheduler", desiredActive, new OperationBudget(), true, _campaignId);
    },
  });
}
