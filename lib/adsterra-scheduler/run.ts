import type { AdsterraCampaignStatusResult } from "../adsterra-roi/client.ts";
import { getJakartaDateParts, shouldSkipScheduledOff } from "./schedule.ts";

export type AdsterraScheduledAction = "ON" | "OFF";
export type AdsterraScheduleTerminalStatus = "SUCCESS" | "FAILED" | "NO_CHANGE" | "SKIPPED_SPECIAL_DAY";
type EnabledConfig = { id: number; campaignId: string; shopeeAccountId: number };
type ClaimInput = { adsterraCampaignConfigId: number; businessDate: string; action: AdsterraScheduledAction };
type FinishInput = { id: number; status: AdsterraScheduleTerminalStatus; actualStatus?: string | null; errorMessage?: string | null };
type VerifiedResult = { verified: boolean; actual: AdsterraCampaignStatusResult; writeWasAmbiguous: boolean };

export type AdsterraSchedulerDependencies<Client> = {
  loadEnabledConfigs(): Promise<EnabledConfig[]>;
  claimRun(input: ClaimInput): Promise<{ id: number } | null>;
  finishRun(input: FinishInput): Promise<void>;
  loadCredential(shopeeAccountId: number): Promise<string | null>;
  createClient(encryptedSecret: string, shopeeAccountId: number): Client | Promise<Client>;
  getCampaignStatus(client: Client, campaignId: string): Promise<AdsterraCampaignStatusResult>;
  setAndVerify(client: Client, campaignId: string, desiredActive: boolean): Promise<VerifiedResult>;
};

type Detail = { configId: number; campaignId: string; status: AdsterraScheduleTerminalStatus; actualStatus?: string; errorMessage?: string };

export async function runAdsterraScheduledCampaigns<Client>(
  action: AdsterraScheduledAction,
  options: { now: Date },
  deps: AdsterraSchedulerDependencies<Client>,
) {
  const businessDate = formatCalendarDate(getJakartaDateParts(options.now));
  const configs = await deps.loadEnabledConfigs();
  const details: Detail[] = [];
  let alreadyClaimed = 0;

  if (action === "OFF" && shouldSkipScheduledOff(options.now)) {
    for (const config of configs) {
      const attempt = await attemptClaim(config, businessDate, action, deps);
      if (attempt.error) { details.push(claimFailure(config)); continue; }
      if (!attempt.claim) { alreadyClaimed += 1; continue; }
      await finish(config, attempt.claim.id, "SKIPPED_SPECIAL_DAY", null, null, deps, details);
    }
    return summarize(configs.length, businessDate, alreadyClaimed, details);
  }

  const groups = groupByShopeeAccount(configs);
  for (const [shopeeAccountId, accountConfigs] of groups) {
    const claimed: Array<{ config: EnabledConfig; runId: number }> = [];
    for (const config of accountConfigs) {
      const attempt = await attemptClaim(config, businessDate, action, deps);
      if (attempt.error) { details.push(claimFailure(config)); continue; }
      if (!attempt.claim) { alreadyClaimed += 1; continue; }
      claimed.push({ config, runId: attempt.claim.id });
    }
    if (claimed.length === 0) continue;

    let client: Client;
    try {
      const credential = await deps.loadCredential(shopeeAccountId);
      if (!credential) {
        for (const item of claimed) await finish(item.config, item.runId, "FAILED", null, "Koneksi Adsterra belum dikonfigurasi.", deps, details);
        continue;
      }
      client = await deps.createClient(credential, shopeeAccountId);
    } catch {
      for (const item of claimed) await finish(item.config, item.runId, "FAILED", null, "Koneksi Adsterra tidak dapat digunakan.", deps, details);
      continue;
    }

    for (const item of claimed) {
      await processCampaign(action, item.config, item.runId, client, deps, details);
    }
  }

  return summarize(configs.length, businessDate, alreadyClaimed, details);
}

async function processCampaign<Client>(action: AdsterraScheduledAction, config: EnabledConfig, runId: number, client: Client, deps: AdsterraSchedulerDependencies<Client>, details: Detail[]) {
  try {
    const current = await deps.getCampaignStatus(client, config.campaignId);
    const desiredStatus = action === "ON" ? "ACTIVE" : "INACTIVE";
    if (current.status === desiredStatus) {
      await finish(config, runId, "NO_CHANGE", current.status, null, deps, details);
      return;
    }
    if (current.status === "NOT_IN_USE") {
      await finish(config, runId, "FAILED", current.status, "Campaign Adsterra berstatus Not in use.", deps, details);
      return;
    }
    const result = await deps.setAndVerify(client, config.campaignId, action === "ON");
    if (!result.verified || result.actual.status !== desiredStatus) {
      await finish(config, runId, "FAILED", result.actual.status, "Status campaign Adsterra tidak terverifikasi.", deps, details);
      return;
    }
    await finish(config, runId, "SUCCESS", result.actual.status, null, deps, details);
  } catch {
    await finish(config, runId, "FAILED", null, "Operasi campaign Adsterra gagal.", deps, details);
  }
}

async function attemptClaim<Client>(config: EnabledConfig, businessDate: string, action: AdsterraScheduledAction, deps: AdsterraSchedulerDependencies<Client>) {
  try { return { claim: await deps.claimRun({ adsterraCampaignConfigId: config.id, businessDate, action }), error: false as const }; }
  catch { return { claim: null, error: true as const }; }
}

function claimFailure(config: EnabledConfig): Detail { return { configId: config.id, campaignId: config.campaignId, status: "FAILED", errorMessage: "Execution scheduler Adsterra gagal diklaim." }; }

async function finish<Client>(config: EnabledConfig, id: number, status: AdsterraScheduleTerminalStatus, actualStatus: string | null, errorMessage: string | null, deps: AdsterraSchedulerDependencies<Client>, details: Detail[]) {
  const input = { id, status, actualStatus, errorMessage };
  try {
    await deps.finishRun(input);
    details.push({ configId: config.id, campaignId: config.campaignId, status, ...(actualStatus ? { actualStatus } : {}), ...(errorMessage ? { errorMessage } : {}) });
  } catch {
    details.push({ configId: config.id, campaignId: config.campaignId, status: "FAILED", errorMessage: "Hasil scheduler Adsterra gagal disimpan." });
  }
}

function groupByShopeeAccount(configs: EnabledConfig[]) {
  const groups = new Map<number, EnabledConfig[]>();
  for (const config of configs) groups.set(config.shopeeAccountId, [...(groups.get(config.shopeeAccountId) ?? []), config]);
  return groups;
}

function summarize(total: number, businessDate: string, alreadyClaimed: number, details: Detail[]) {
  return {
    total,
    success: details.filter((item) => item.status === "SUCCESS").length,
    noChange: details.filter((item) => item.status === "NO_CHANGE").length,
    skipped: details.filter((item) => item.status === "SKIPPED_SPECIAL_DAY").length,
    failed: details.filter((item) => item.status === "FAILED").length,
    alreadyClaimed,
    businessDate,
    details,
  };
}

function formatCalendarDate(value: { year: number; month: number; day: number }) {
  return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}
