import { digest, exactSet, sortedIds } from "./canonical";
import { signConfirmation, verifyConfirmation } from "./confirmation";
import { OperationError, type ApplicationPlan, type ApplicationResult, type Confirmation, type WhitelistRejection } from "./types";
import type { Fence } from "./repository";

export function parseWhitelistExclusions(value: unknown): string[] {
  if (value === null || value === undefined || value === "") return [];
  let parsed: unknown = value;
  if (typeof value === "string") { if (value.length > 100_000) throw new OperationError("Daftar pengecualian terlalu besar."); try { parsed = JSON.parse(value); } catch { throw new OperationError("Pengecualian Whitelist tidak valid."); } }
  if (!Array.isArray(parsed) || parsed.length > 5000 || parsed.some((id) => typeof id !== "string" || !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))) throw new OperationError("Identitas pengecualian Whitelist tidak valid.");
  if (new Set(parsed).size !== parsed.length) throw new OperationError("Pengecualian Whitelist berulang.");
  return sortedIds(parsed as string[]);
}

export function whitelistRejectionReceipt(plan: ApplicationPlan, fence: Fence, methodVersion: number, owner: string, now: number,
  rejection: WhitelistRejection): NonNullable<ApplicationResult["whitelistRejection"]> {
  const previousExcluded = plan.excluded ?? [], ids = sortedIds(rejection.ids), expiresAt = now + 300_000;
  const signed: Confirmation = { ...fence, ...plan.scope, kind: "WHITELIST", owner, methodVersion, purpose: "ADSTERRA_WHITELIST_REJECTION_V1",
    inputHash: plan.inputHash, preconditionHash: digest({ target: plan.target, ids, previousExcluded }), rules: "ROI20_OR_10_CTR8_SPEND1000_V1", expiresAt };
  return { ...rejection, ids, previousExcluded, token: signConfirmation(signed), expiresAt: new Date(expiresAt).toISOString() };
}

/** A diagnostic sample cannot authorize exclusions: require the scoped receipt. */
export function validateWhitelistExclusions(plan: ApplicationPlan, data: FormData, owner: string, now: number) {
  const excluded = plan.excluded ?? [];
  if (!excluded.length) return;
  if (plan.kind !== "WHITELIST") throw new OperationError("Pengecualian hanya untuk penolakan Whitelist.");
  const signed = verifyConfirmation(data.get("whitelistRejectionToken"), owner, "ADSTERRA_WHITELIST_REJECTION_V1", now);
  const ids = parseWhitelistExclusions(data.get("whitelistRejectedIds")), previousExcluded = parseWhitelistExclusions(data.get("whitelistPreviousExclusions"));
  const target = sortedIds([...plan.target, ...excluded].filter((id) => !previousExcluded.includes(id)));
  if (!ids.length || !exactSet(excluded, sortedIds([...previousExcluded, ...ids])) || ids.some((id) => !target.includes(id))
    || signed.campaignId !== plan.scope.campaignId || signed.configId !== plan.scope.configId || signed.shopeeAccountId !== plan.scope.shopeeAccountId || signed.kind !== "WHITELIST"
    || signed.methodVersion !== plan.before.method.methodVersion || signed.inputHash !== plan.inputHash || signed.preconditionHash !== digest({ target, ids, previousExcluded })) {
    throw new OperationError("Penolakan/input/metode berubah atau pengecualian bukan bagian target terkait. Jalankan analisis/penerapan baru tanpa mengubah kandidat diam-diam.");
  }
}
