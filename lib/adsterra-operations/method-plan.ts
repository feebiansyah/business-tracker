import { digest } from "./canonical";
import { preconditionHash } from "./application";
import { capabilityError } from "./method-state";
import type { ListKind, Scope, Snapshot } from "./types";
import { blacklistCount, whitelistCompatible } from "./list-evidence";

export function planMethod(scope: Scope, before: Snapshot, kind: ListKind) {
  const target = kind === "BLACKLIST" ? before.blacklist : before.whitelist;
  const opposite = kind === "BLACKLIST" ? before.whitelist : before.blacklist;
  const same = before.method.placementMethod === kind;
  const oppositeCompatible = kind === "BLACKLIST" ? Array.isArray(before.blacklist) && !before.whitelist.length
    : whitelistCompatible(before.blacklist, before.whitelist, scope.campaignId);
  const reset = !same && (before.method.placementMethod !== null || !oppositeCompatible || (kind === "WHITELIST" && before.whitelist.length === 0));
  const adopt = before.method.placementMethod === null && oppositeCompatible && (kind === "BLACKLIST" || before.whitelist.length > 0);
  const requiresInactive = reset;
  const blockers: string[] = [];
  const unsupported = capabilityError(kind, before.campaign.pricing);
  if (unsupported) blockers.push(unsupported);
  if (blacklistCount(before.blacklist) && before.whitelist.length && !reset) blockers.push("Kedua daftar API terisi. Memilih metode yang sama tidak mereset konflik provider.");
  if (same && !oppositeCompatible) blockers.push("Daftar berlawanan terisi atau belum dapat diverifikasi. Memilih metode yang sama tidak mereset daftar.");
  return { scope, kind, before, target, opposite, adopt, same, reset, requiresInactive, blockers,
    clearBlacklist: reset ? before.blacklist : [], clearWhitelist: reset ? before.whitelist : [],
    inputHash: digest({ scope, kind, purpose: "CAMPAIGN_METHOD_V2" }),
    preconditionHash: preconditionHash(before, [], kind) };
}
export type MethodPlan = ReturnType<typeof planMethod>;
export type MethodPreview = Omit<MethodPlan, "before" | "inputHash" | "preconditionHash"> & {
  token: string; expiresAt: string; previousMethod: ListKind | null; methodVersion: number;
  providerStatus: string; autoEnabledAliases: number[];
  blacklist: Snapshot["blacklist"]; whitelist: string[]; preservedBids: Snapshot["bids"];
};
