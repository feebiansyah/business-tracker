import { digest } from "./canonical";
import { preconditionHash } from "./application";
import { capabilityError } from "./method-state";
import type { ListKind, Scope, Snapshot } from "./types";

export function planMethod(scope: Scope, before: Snapshot, kind: ListKind) {
  const target = kind === "BLACKLIST" ? before.blacklist : before.whitelist;
  const opposite = kind === "BLACKLIST" ? before.whitelist : before.blacklist;
  const adopt = before.method.placementMethod === null && target.length > 0 && !opposite.length;
  const requiresInactive = !adopt;
  const blockers: string[] = [];
  const unsupported = capabilityError(kind, before.campaign.pricing);
  if (unsupported) blockers.push(unsupported);
  if (before.method.placementMethod === kind) blockers.push("Metode sudah sama. Konfirmasi ulang daftar/dampak bid melalui Placement, bukan penetapan metode ulang.");
  if (target.length && opposite.length) blockers.push("Kedua daftar API terisi (konflik). Tidak memperbaiki konflik atau menebak mode editor otomatis.");
  if (requiresInactive) {
    if (before.campaign.active !== 1) blockers.push("Penetapan kosong/pergantian metode memerlukan provider strictly INACTIVE; LIMITED tidak cukup.");
    if (before.aliases.some((a) => a.autoScheduleEnabled)) blockers.push("Nonaktifkan Auto ON/OFF pada seluruh alias campaign fisik ini dahulu.");
  }
  return { scope, kind, before, target, opposite, adopt, requiresInactive, blockers,
    inputHash: digest({ scope, kind, purpose: "CAMPAIGN_METHOD_V1" }),
    preconditionHash: preconditionHash(before, [], kind) };
}
export type MethodPlan = ReturnType<typeof planMethod>;
export type MethodPreview = Omit<MethodPlan, "before" | "inputHash" | "preconditionHash"> & {
  token: string; expiresAt: string; previousMethod: ListKind | null; methodVersion: number;
  providerStatus: string; autoEnabledAliases: number[];
  blacklist: string[]; whitelist: string[]; preservedBids: Snapshot["bids"];
};
