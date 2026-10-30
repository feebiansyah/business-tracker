import type { BlacklistUnavailable, BlacklistValue } from "./types";

/** A specific provider refusal, NOT evidence of an empty blacklist or editor mode. */
export function parseWhitelistBlacklistRefusal(body: unknown, campaignId: string): BlacklistUnavailable | null {
  if (!/^[1-9]\d*$/.test(campaignId) || !body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>, errors = value.errors;
  if (value.message !== "Unprocessable Content" || Object.keys(value).some((key) => !["message", "errors"].includes(key))
    || !errors || typeof errors !== "object" || Array.isArray(errors)) return null;
  const fields = errors as Record<string, unknown>, reasons = fields.campaign_ids;
  if (Object.keys(fields).length !== 1 || !Array.isArray(reasons) || reasons.length !== 1
    || reasons[0] !== `Campaigns, inoperable due to having a whitelist: ${campaignId}`) return null;
  return { status: "UNREADABLE_WHITELIST", campaignId, httpStatus: 422 };
}

export function isWhitelistBlacklistRefusal(value: unknown): value is BlacklistUnavailable {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as BlacklistUnavailable;
  return state.status === "UNREADABLE_WHITELIST" && state.httpStatus === 422 && typeof state.campaignId === "string"
    && /^[1-9]\d*$/.test(state.campaignId) && Object.keys(state).length === 3;
}

export function whitelistCompatible(blacklist: BlacklistValue, whitelist: readonly string[], campaignId?: string) {
  return Array.isArray(blacklist) ? blacklist.length === 0 : isWhitelistBlacklistRefusal(blacklist)
    && whitelist.length > 0 && (campaignId === undefined || blacklist.campaignId === campaignId);
}

export function blacklistCount(value: BlacklistValue) { return Array.isArray(value) ? value.length : null; }
export function blacklistDescription(value: BlacklistValue) {
  return Array.isArray(value) ? `${value.length} placement` : "tidak dapat dibaca karena campaign memiliki Whitelist (HTTP 422), bukan daftar kosong";
}
