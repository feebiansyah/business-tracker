import { ClickaduAmbiguousWriteError } from "./client.ts";
import type { ClickaduListMethod } from "./list-method";

type UnknownRecord = Record<string, unknown>;

const CAMPAIGN_UPDATE_FIELDS = [
  "name", "direction", "frequency", "capping", "freqCapType", "status",
  "rateModel", "feed", "targetUrl", "rates", "dailyAmount", "totalAmount",
  "evenlyLimitsUsage", "impressionsLimit", "impressionsLimitEnabled",
  "impFrequency", "impCapping", "isAdblockBuy", "isDsp", "trafficVertical",
  "budgetLimit", "startedAt", "skipOffset", "video", "pushNotificationTitle",
  "pushNotificationDescription", "pushNotificationIcon", "pushNotificationCreative",
  "allowInPage", "allowOnlyInPage", "cohort",
] as const;

export class BlacklistReplacementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlacklistReplacementError";
  }
}

export type ClickaduBlacklistDependencies = {
  getCampaign(campaignId: string): Promise<UnknownRecord>;
  getBlockedZones(campaignId: string): Promise<string[]>;
  updateCampaign(campaignId: string, payload: UnknownRecord): Promise<void>;
};

export function normalizeZoneIds(values: readonly unknown[]) {
  const zones: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const zone = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
    if (!zone || seen.has(zone)) continue;
    seen.add(zone);
    zones.push(zone);
  }
  return zones;
}

export function zoneSetsEqual(left: readonly unknown[], right: readonly unknown[]) {
  const a = normalizeZoneIds(left);
  const b = normalizeZoneIds(right);
  return a.length === b.length && a.every((zone) => b.includes(zone));
}

export function buildCampaignBlacklistUpdate(campaign: UnknownRecord, candidateZoneIds: readonly unknown[], method: ClickaduListMethod = "BLACKLIST") {
  const targeting = asRecord(campaign.targeting, "Targeting campaign Clickadu tidak valid.");
  const payload: UnknownRecord = {};
  for (const field of CAMPAIGN_UPDATE_FIELDS) {
    if (Object.hasOwn(campaign, field)) payload[field] = campaign[field];
  }
  for (const required of ["name", "direction", "frequency", "capping", "freqCapType", "status", "rateModel", "feed", "targetUrl", "rates"] as const) {
    if (!Object.hasOwn(payload, required)) throw new BlacklistReplacementError("Data campaign Clickadu belum lengkap untuk diperbarui.");
  }
  payload.targeting = {
    ...targeting,
    zone: { list: normalizeZoneIds(candidateZoneIds), isExcluded: method === "BLACKLIST" },
  };
  return payload;
}

export async function replaceClickaduBlacklist(
  campaignId: string,
  candidateZoneIds: readonly unknown[],
  deps: ClickaduBlacklistDependencies,
) {
  const candidates = normalizeZoneIds(candidateZoneIds);
  const campaign = await deps.getCampaign(campaignId);
  const existing = verifiedBlacklist(campaign, campaignId);
  if (zoneSetsEqual(candidates, existing)) {
    return { status: "NO_CHANGE" as const, blockedZoneCount: candidates.length, candidateZoneIds: candidates };
  }
  const payload = buildCampaignBlacklistUpdate(campaign, candidates);

  try {
    await deps.updateCampaign(campaignId, payload);
  } catch (error) {
    if (!(error instanceof ClickaduAmbiguousWriteError)) throw error;
    const actual = verifiedBlacklist(await deps.getCampaign(campaignId), campaignId);
    if (!zoneSetsEqual(candidates, actual)) {
      throw new BlacklistReplacementError("Status update Clickadu tidak dapat dipastikan dan verifikasi blacklist tidak cocok.");
    }
    return { status: "UPDATED" as const, blockedZoneCount: candidates.length, candidateZoneIds: candidates };
  }

  const actual = verifiedBlacklist(await deps.getCampaign(campaignId), campaignId);
  if (!zoneSetsEqual(candidates, actual)) {
    throw new BlacklistReplacementError("Verifikasi blacklist Clickadu gagal: daftar zone tidak cocok.");
  }
  return { status: "UPDATED" as const, blockedZoneCount: candidates.length, candidateZoneIds: candidates };
}

function asRecord(value: unknown, message: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BlacklistReplacementError(message);
  return value as UnknownRecord;
}

// The retained Blacklist entrypoint cannot silently switch the provider method
// or mistake a failed/malformed list read for an empty, verified Blacklist.
function verifiedBlacklist(campaign: UnknownRecord, campaignId: string): string[] {
  const zone = asRecord(asRecord(campaign.targeting, "Targeting campaign Clickadu tidak valid.").zone, "Metode Zone Clickadu belum tersedia.");
  if (String(campaign.id) !== campaignId || zone.isExcluded !== true || !Array.isArray(zone.list)
    || zone.list.some((id) => typeof id !== "string" || !/^\d+$/.test(id)) || new Set(zone.list).size !== zone.list.length) {
    throw new BlacklistReplacementError("Metode/daftar aktual belum terbukti Blacklist. Gunakan konfirmasi metode terbaru.");
  }
  return zone.list;
}
