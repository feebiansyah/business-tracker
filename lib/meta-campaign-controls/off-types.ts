import type { HierarchyPreview, MetaObjectView, PreviewInput, PreviewTarget } from "./types";

export type OffKind = "ALL" | "ADSET" | "AD";
export type ObjectKind = "campaign" | "adset" | "ad";
export type OffSelection = { scope: PreviewInput; kind: OffKind; objectId: string };
export type OffObject = MetaObjectView & { kind: ObjectKind; parentId: string | null };
export type OffPlan = { selection: OffSelection; target: PreviewTarget; objects: OffObject[]; guards: OffObject[]; hierarchy?: HierarchyPreview };
export type OffConfirmation = {
  token: string; kind: OffKind; target: PreviewTarget; objects: OffObject[]; expiresAt: string;
  counts: { campaign: number; adset: number; ad: number; needPause: number };
};
export type OffObjectState = "VERIFIED_PAUSED" | "ALREADY_PAUSED" | "FAILED" | "UNVERIFIED" | "NOT_ATTEMPTED";
export type OffObjectResult = { object: OffObject; state: OffObjectState; message: string; readAt: string | null; postSent: boolean };
export type OffExecution = {
  status: "COMPLETE" | "PARTIAL"; message: string; objects: OffObjectResult[];
  finalRead: "COMPLETE" | "PARTIAL" | "FAILED"; newObjects: OffObject[];
  verifiedObjects: MetaObjectView[]; hierarchy?: HierarchyPreview; requests: number; finishedAt: string;
};
export type PrepareOffResult = { success: true; confirmation: OffConfirmation } | { success: false; message: string };
export type ExecuteOffResult = { success: true; result: OffExecution } | { success: false; status: "REJECTED" | "RECONFIRM_REQUIRED"; message: string };
