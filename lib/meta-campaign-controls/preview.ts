import "server-only";

import { MetaCampaignReadClient } from "./read-client";
import { MetaReadError, metaId, parseMetaObject } from "./parse";
import type { HierarchyPreview, PreviewResult, PreviewTarget } from "./types";

export async function readCampaignPreview(target: PreviewTarget, client = new MetaCampaignReadClient()): Promise<PreviewResult> {
  try {
    const campaignId = metaId(target.campaign.id);
    const accountId = metaId(target.wl.id);
    const root = await client.read(campaignId);
    const campaign = parseMetaObject(root.payload, { accountId, objectId: campaignId }, client.safeText).view;
    async function readEdge(edge: "adsets" | "ads") {
      const rows: ReturnType<typeof parseMetaObject>[] = [];
      const ids = new Set<string>();
      const cursors = new Set<string>();
      let after: string | undefined;
      let diagnostics = true;
      try {
        do {
          const response = await client.read(campaignId, edge, after, diagnostics);
          diagnostics = response.diagnostics;
          const page = client.page(response.payload);
          const parsed = page.rows.map((row) => parseMetaObject(row, { accountId, campaignId }, client.safeText));
          for (const item of parsed) {
            if (edge === "ads" && !item.adSetId) throw new MetaReadError("INTEGRITY", "Iklan tidak memiliki relasi set iklan yang valid.");
            if (ids.has(item.view.id)) throw new MetaReadError("INTEGRITY", "ID objek berulang pada pagination Meta; pembacaan dihentikan.");
            client.claimObject(); ids.add(item.view.id); rows.push(item);
          }
          if (page.after && cursors.has(page.after)) throw new MetaReadError("INVALID_RESPONSE", "Cursor Meta berulang; pembacaan dihentikan agar tidak berputar.");
          after = page.after ?? undefined;
          if (after) cursors.add(after);
        } while (after);
        return { rows, complete: true, warning: null };
      } catch (error) {
        return { rows, complete: false, warning: error instanceof MetaReadError ? { kind: error.kind, message: error.message } : { kind: "PROVIDER" as const, message: "Sebagian hierarchy Meta gagal dibaca." } };
      }
    }
    // Exactly two streams; each follows its own pages sequentially, sharing all budgets.
    const [sets, ads] = await Promise.all([readEdge("adsets"), readEdge("ads")]);
    const warnings: HierarchyPreview["warnings"] = [sets.warning, ads.warning].filter((warning) => warning !== null);
    const grouped = new Map(sets.rows.map(({ view }) => [view.id, { ...view, ads: [] as typeof campaign[] }]));
    let ungroupedAdCount = 0;
    for (const { view, adSetId } of ads.rows) {
      const parent = adSetId ? grouped.get(adSetId) : undefined;
      if (parent) parent.ads.push(view);
      else ungroupedAdCount++;
    }
    if (ungroupedAdCount) warnings.push({ kind: sets.complete ? "INTEGRITY" : "INVALID_RESPONSE", message: `${ungroupedAdCount} iklan tidak ditampilkan karena relasi set iklannya belum terverifikasi. Tidak digabungkan berdasarkan nama.` });
    const integrityError = warnings.some((warning) => warning.kind === "INTEGRITY");
    return { success: true, data: {
      target, campaign, adSets: [...grouped.values()],
      readState: integrityError ? "INTEGRITY_ERROR" : sets.complete && ads.complete && !ungroupedAdCount ? "COMPLETE" : "PARTIAL",
      adSetsComplete: sets.complete, adsComplete: ads.complete && !ungroupedAdCount,
      loadedAdCount: ads.rows.length - ungroupedAdCount, ungroupedAdCount, warnings,
      startedAt: client.startedAt, readAt: new Date().toISOString(), requests: client.requests,
    } };
  } catch (error) {
    return error instanceof MetaReadError ? { success: false, kind: error.kind, message: error.message } : { success: false, message: "Pembacaan campaign Meta gagal. Tidak ada perubahan iklan yang dijalankan." };
  }
}
