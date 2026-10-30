import type { AdsterraCustomBid } from "../adsterra-roi/types";
import type { OperationDiagnostic } from "./diagnostics";

export type ListKind = "BLACKLIST" | "WHITELIST";
export type MethodState = {
  placementMethod: ListKind | null; methodVersion: number; methodReady: boolean;
  approvedBlacklistHash: string | null; approvedWhitelistHash: string | null;
};
export type Readiness = "READY" | "NOT_APPLIED" | "LIST_CHANGED" | "CONFLICT" | "UNVERIFIABLE";
export type MethodInfo = {
  status: "SUCCESS" | "UNAVAILABLE"; method: MethodState | null;
  readiness: Readiness; message: string; readAt: string;
};
export type Outcome = "VERIFIED" | "NO_CHANGE" | "RECONFIRM_REQUIRED" | "PARTIAL" | "UNVERIFIED";
export type Scope = { shopeeAccountId: number; configId: number; campaignId: string; label: string; sourceTag: string };
export type Alias = { id: number; shopeeAccountId: number; campaignId: string; autoScheduleEnabled: boolean };
export type Snapshot = {
  campaign: { id: string; active: 1 | 2 | 3 | 4; pricing: string };
  blacklist: string[]; whitelist: string[]; bids: AdsterraCustomBid[];
  aliases: Alias[]; scopeHash: string; method: MethodState;
};
export type ApplicationPlan = {
  scope: Scope; kind: ListKind; dateFrom: string; dateTill: string; fxRate: string;
  target: string[]; before: Snapshot; added: string[]; removed: string[];
  opposite: string[]; resetBids: AdsterraCustomBid[]; inputHash: string; preconditionHash: string;
  blockers: string[];
  excluded?: string[];
};
export type Confirmation = {
  purpose: "ADSTERRA_LIST_APPLY_V3" | "ADSTERRA_WHITELIST_REJECTION_V1" | "ADSTERRA_LIST_RECOVER_V2" | "ADSTERRA_METHOD_SET_V2";
  operationId: string; generation: number; owner: string; campaignId: string;
  shopeeAccountId: number; configId: number; kind: ListKind;
  inputHash: string; preconditionHash: string; rules: "ROI20_OR_10_CTR8_SPEND1000_V1";
  expiresAt: number;
  methodVersion: number;
  exclusionsHash?: string;
};
export type Preview = Omit<ApplicationPlan, "before" | "inputHash" | "preconditionHash"> & {
  token: string; expiresAt: string; currentBlacklist: string[]; currentWhitelist: string[];
  providerStatus: string; autoEnabledAliases: number[];
};
export type ApplicationResult = {
  status: Outcome; phase: string; message: string; writeWarnings: string[];
  actual: { blacklist: string[]; whitelist: string[]; bids: AdsterraCustomBid[] } | null;
  metadata: "RECORDED" | "FAILED" | "NOT_REQUIRED";
  lastBlacklistReplacedAt?: string | null;
  diagnostics?: OperationDiagnostic[];
  writes?: number;
  whitelistRejection?: WhitelistRejection & { token: string; previousExcluded: string[]; expiresAt: string };
};
export type WhitelistRejection = {
  ids: string[];
  groups: { reason: OperationDiagnostic["reasons"][number]; ids: string[] }[];
  complete: boolean;
};
export class OperationError extends Error { constructor(message: string) { super(message); this.name = "OperationError"; } }
