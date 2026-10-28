import "server-only";

import { createHash } from "node:crypto";
import { parsePreviewInput } from "./scope";
import { metaId, MetaReadError, record } from "./parse";
import { readCampaignPreview } from "./preview";
import type { MetaPausedClient } from "./off-client";
import type { OffObject, OffPlan, OffSelection } from "./off-types";
import type { HierarchyPreview, PreviewTarget } from "./types";

export function parseOffSelection(value: unknown): OffSelection {
  const input = record(value);
  if (Object.keys(input).some((key) => !["scope", "kind", "objectId"].includes(key)) || !["ALL", "ADSET", "AD"].includes(String(input.kind))) throw new Error("Tindakan OFF tidak valid.");
  return { scope: parsePreviewInput(input.scope), kind: input.kind as OffSelection["kind"], objectId: metaId(input.objectId) };
}

export function hierarchyObjects(data: HierarchyPreview): OffObject[] {
  return [
    { ...data.campaign, kind: "campaign", parentId: null } as OffObject,
    ...data.adSets.map((set) => ({ id: set.id, name: set.name, configuredStatus: set.configuredStatus, effectiveStatus: set.effectiveStatus, diagnostics: set.diagnostics, kind: "adset" as const, parentId: data.campaign.id })),
    ...data.adSets.flatMap((set) => set.ads.map((ad) => ({ ...ad, kind: "ad" as const, parentId: set.id }))),
  ];
}

export async function buildOffPlan(selection: OffSelection, target: PreviewTarget, client: MetaPausedClient): Promise<OffPlan> {
  client.budget.remaining();
  let plan: OffPlan;
  if (selection.kind === "ALL") {
    if (selection.objectId !== target.campaign.id) throw new MetaReadError("INTEGRITY", "Campaign browser tidak sesuai lookup server.");
    const response = await client.budget.waitReadOnly(() => readCampaignPreview(target, client.reader));
    if (!response.success) throw new MetaReadError(response.kind ?? "PROVIDER", response.message);
    if (response.data.readState !== "COMPLETE") throw new MetaReadError("INTEGRITY", "OFF Semua memerlukan hierarchy lengkap dan relasi valid. Tidak ada POST dijalankan.");
    plan = { selection, target, objects: hierarchyObjects(response.data), guards: [], hierarchy: response.data };
  } else {
    const kind = selection.kind === "AD" ? "ad" : "adset";
    const object = await client.object(target, selection.objectId, kind);
    const guards = kind === "ad" ? [await client.object(target, object.parentId!, "adset")] : [];
    plan = { selection, target, objects: [object], guards };
  }
  if (plan.objects.some((object) => !object.configuredStatus)) throw new MetaReadError("INVALID_RESPONSE", "Status konfigurasi target belum tersedia. Tindakan ditolak.");
  client.budget.remaining();
  return plan;
}

export function planDigest(plan: OffPlan) {
  const items = (objects: OffObject[]) => objects.map(({ kind, id, parentId, name, configuredStatus }) => ({ kind, id, parentId, name, configuredStatus })).sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  return createHash("sha256").update(JSON.stringify({ selection: plan.selection, target: plan.target, objects: items(plan.objects), guards: items(plan.guards) })).digest("hex");
}

export function finalReadMinimum(plan: OffPlan) {
  if (plan.selection.kind !== "ALL") return plan.selection.kind === "AD" ? 2 : 1;
  return 1 + Math.max(1, Math.ceil(plan.objects.filter((object) => object.kind === "adset").length / 100)) + Math.max(1, Math.ceil(plan.objects.filter((object) => object.kind === "ad").length / 100));
}

export function minimumRemainingRequests(plan: OffPlan) {
  return plan.objects.filter((object) => object.configuredStatus !== "PAUSED").reduce((sum, object) => sum + (object.kind === "ad" ? 5 : 3), finalReadMinimum(plan));
}
