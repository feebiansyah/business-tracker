import "server-only";
import { prisma } from "../prisma";
import { TrafficProvider } from "../generated/prisma/client";
import { getEncryptedTrafficCredential } from "../traffic-credentials/repository";
import { decryptTrafficSecret } from "../traffic-credentials/crypto";
import { getAdsterraClient } from "../adsterra-roi/config";
import { setAndVerifyAdsterraCampaignActive } from "../adsterra-roi/campaign-activity";
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
    setAndVerify: (client, campaignId, desiredActive) => setAndVerifyAdsterraCampaignActive(campaignId, desiredActive, client),
  });
}
