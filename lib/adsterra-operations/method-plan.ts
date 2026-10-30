import { digest } from "./canonical";
import { preconditionHash } from "./application";
import { capabilityError } from "./method-state";
import type { ListKind, Scope, Snapshot } from "./types";

export function planMethod(scope: Scope, before: Snapshot, kind: ListKind) {
  const target = kind === "BLACKLIST" ? before.blacklist : before.whitelist;
  const opposite = kind === "BLACKLIST" ? before.whitelist : before.blacklist;
  const same = before.method.placementMethod === kind;
  const reset = !same && (before.method.placementMethod !== null || opposite.length > 0 || (kind === "WHITELIST" && target.length === 0));
  const adopt = before.method.placementMethod === null && !opposite.length && (target.length > 0 || kind === "BLACKLIST");
  const requiresInactive = reset;
  const blockers: string[] = [];
  const unsupported = capabilityError(kind, before.campaign.pricing);
  if (unsupported) blockers.push(unsupported);
  if (target.length && opposite.length && !reset) blockers.push("Kedua daftar API terisi. Memilih metode yang sama tidak mereset konflik provider.");
  if (same && opposite.length) blockers.push("Daftar berlawanan terisi. Periksa konflik provider; memilih metode yang sama tidak mereset daftar.");
  return { scope, kind, before, target, opposite, adopt, same, reset, requiresInactive, blockers,
    clearBlacklist: reset ? before.blacklist : [], clearWhitelist: reset ? before.whitelist : [],
    inputHash: digest({ scope, kind, purpose: "CAMPAIGN_METHOD_V2" }),
    preconditionHash: preconditionHash(before, [], kind) };
}
export type MethodPlan = ReturnType<typeof planMethod>;
export type MethodPreview = Omit<MethodPlan, "before" | "inputHash" | "preconditionHash"> & {
  token: string; expiresAt: string; previousMethod: ListKind | null; methodVersion: number;
  providerStatus: string; autoEnabledAliases: number[];
  blacklist: string[]; whitelist: string[]; preservedBids: Snapshot["bids"];
};
