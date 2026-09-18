import { ClickaduAmbiguousWriteError } from "./client.ts";

type UnknownRecord = Record<string, unknown>;

const CAMPAIGN_UPDATE_FIELDS = [
  "name", "direction", "frequency", "capping", "freqCapType", "status",
  "rateModel", "feed", "targetUrl", "rates", "dailyAmount", "totalAmount",
  "evenlyLimitsUsage", "impressionsLimit", "impressionsLimitEnabled",
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

export function buildCampaignBlacklistUpdate(campaign: UnknownRecord, candidateZoneIds: readonly unknown[]) {
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
    zone: { list: normalizeZoneIds(candidateZoneIds), isExcluded: true },
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
  const existing = await deps.getBlockedZones(campaignId);
  if (zoneSetsEqual(candidates, existing)) {
    return { status: "NO_CHANGE" as const, blockedZoneCount: candidates.length, candidateZoneIds: candidates };
  }
  const payload = buildCampaignBlacklistUpdate(campaign, candidates);

  try {
    await deps.updateCampaign(campaignId, payload);
  } catch (error) {
    if (!(error instanceof ClickaduAmbiguousWriteError)) throw error;
    const actual = await deps.getBlockedZones(campaignId);
    if (!zoneSetsEqual(candidates, actual)) {
      throw new BlacklistReplacementError("Status update Clickadu tidak dapat dipastikan dan verifikasi blacklist tidak cocok.");
    }
    return { status: "UPDATED" as const, blockedZoneCount: candidates.length, candidateZoneIds: candidates };
  }

  const actual = await deps.getBlockedZones(campaignId);
  if (!zoneSetsEqual(candidates, actual)) {
    throw new BlacklistReplacementError("Verifikasi blacklist Clickadu gagal: daftar zone tidak cocok.");
  }
  return { status: "UPDATED" as const, blockedZoneCount: candidates.length, candidateZoneIds: candidates };
}

function asRecord(value: unknown, message: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BlacklistReplacementError(message);
  return value as UnknownRecord;
}
