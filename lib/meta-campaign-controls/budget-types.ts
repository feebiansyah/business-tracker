import type { PreviewInput, PreviewTarget } from "./types";

export type BudgetValue = { state: "MISSING" | "NULL" | "INVALID" } | { state: "VALUE"; value: string };
export type BudgetFlag = "TRUE" | "FALSE" | "MISSING" | "NULL" | "INVALID";
export type BudgetKind = "campaign" | "adset";
export type BudgetObject = {
  id: string; name: string | null; kind: BudgetKind; parentId: string | null;
  daily: BudgetValue; lifetime: BudgetValue; schedule: BudgetFlag;
};
export type BudgetSnapshot = {
  target: PreviewTarget; currency: string | null; campaign: BudgetObject; adSets: BudgetObject[];
  sharing: BudgetFlag; complete: boolean; warnings: string[]; readAt: string;
};
export type BudgetMode = "CAMPAIGN" | "ADSET" | "UNKNOWN";
export type BudgetEligibility = { mode: BudgetMode; editable: boolean; reason: string; object: BudgetObject | null };
export type BudgetSelection = { scope: PreviewInput; kind: BudgetKind; objectId: string; amount: string };
export type BudgetConfirmation = {
  token: string; target: PreviewTarget; object: BudgetObject; mode: BudgetMode;
  currency: "IDR"; oldAmount: string; newAmount: string; expiresAt: string;
};
export type BudgetExecution = {
  status: "VERIFIED" | "ALREADY_MATCH" | "UNVERIFIED" | "RECONFIRM_REQUIRED" | "REJECTED";
  message: string; postSent: boolean; snapshot?: BudgetSnapshot; requests: number;
};
export type BudgetReadResult = { success: true; snapshot: BudgetSnapshot } | { success: false; message: string };
export type BudgetPrepareResult = { success: true; confirmation: BudgetConfirmation } | { success: false; message: string };
