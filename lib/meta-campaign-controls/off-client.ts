import "server-only";

import { createHmac } from "node:crypto";
import { getMetaConfig, type MetaConfig } from "@/lib/meta/config";
import { MetaActionBudget } from "./action-budget";
import { MetaCampaignReadClient } from "./read-client";
import { metaId, parseMetaObject, record, MetaReadError } from "./parse";
import type { ObjectKind, OffObject } from "./off-types";
import type { PreviewTarget } from "./types";

export class MetaPausedClient {
  readonly reader: MetaCampaignReadClient;
  private readonly transport: typeof fetch;
  constructor(readonly budget: MetaActionBudget, private readonly config: MetaConfig = getMetaConfig(), fetchImpl: typeof fetch = fetch) {
    this.transport = budget.wrap(fetchImpl);
    this.reader = this.freshHierarchyReader();
  }

  /** Each traversal retains its own 5,000-object cap; action request/time limits stay shared. */
  freshHierarchyReader() {
    return new MetaCampaignReadClient(this.config, this.transport, Date.now, this.budget.startedAt);
  }

  async object(target: PreviewTarget, id: string, kind: ObjectKind): Promise<OffObject> {
    metaId(id);
    if (kind === "campaign" && id !== target.campaign.id) throw new MetaReadError("INTEGRITY", "Campaign tidak sesuai target.");
    // The official SDK types these edges as Campaign[], AdSet[], and Ad[]. Never infer kind
    // from common node fields or metadata aliases; stop as soon as exact membership is proved.
    const edge = kind === "campaign" ? "campaigns" : kind === "adset" ? "adsets" : "ads";
    const parentId = kind === "campaign" ? target.wl.id : target.campaign.id;
    const ids = new Set<string>(), cursors = new Set<string>();
    let after: string | undefined;
    do {
      this.budget.remaining();
      const page = this.reader.page(await this.reader.readTypedPage(parentId, edge, after));
      this.budget.remaining();
      let found: ReturnType<typeof parseMetaObject> | undefined;
      for (const value of page.rows) {
        const row = record(value), rowId = metaId(row.id);
        if (ids.has(rowId)) throw new MetaReadError("INTEGRITY", "ID berulang pada pembuktian jenis Meta.");
        if (ids.size >= 5_000) throw new MetaReadError("LIMIT", "Batas 5.000 objek pembuktian jenis tercapai; jenis target belum terbukti.");
        ids.add(rowId);
        if (rowId === id) {
          found = parseMetaObject(row, { accountId: target.wl.id, objectId: id, ...(kind !== "campaign" ? { campaignId: target.campaign.id } : {}) }, this.reader.safeText);
          if (kind === "ad" && !found.adSetId) throw new MetaReadError("INTEGRITY", "Relasi set iklan belum terverifikasi.");
        }
      }
      if (found) return { ...found.view, kind, parentId: kind === "campaign" ? null : kind === "adset" ? target.campaign.id : found.adSetId! };
      if (page.after && cursors.has(page.after)) throw new MetaReadError("INTEGRITY", "Cursor berulang pada pembuktian jenis Meta.");
      after = page.after ?? undefined;
      if (after) cursors.add(after);
    } while (after);
    throw new MetaReadError("INTEGRITY", "Jenis/keanggotaan target tidak terbukti pada edge Meta yang sesuai; tindakan ditolak.");
  }

  proofReadCost(target: PreviewTarget, object: Pick<OffObject, "id" | "kind" | "parentId">) {
    const own = this.reader.membershipPageCost(object.kind === "campaign" ? target.wl.id : target.campaign.id, object.kind === "campaign" ? "campaigns" : object.kind === "adset" ? "adsets" : "ads", object.id);
    return own + (object.kind === "ad" ? this.reader.membershipPageCost(target.campaign.id, "adsets", object.parentId!) : 0);
  }

  async proof(target: PreviewTarget, object: Pick<OffObject, "id" | "kind" | "parentId">) {
    const current = await this.object(target, object.id, object.kind);
    if (current.parentId !== object.parentId) throw new MetaReadError("INTEGRITY", "Relasi parent berubah. Konfirmasi ulang diperlukan.");
    if (current.kind === "ad") await this.object(target, current.parentId!, "adset");
    return current;
  }

  /** The only write primitive. No caller-supplied status, method, URL, or automatic retry. */
  async pause(id: string): Promise<"ACKNOWLEDGED" | "REJECTED" | "AMBIGUOUS"> {
    this.budget.remaining();
    const url = new URL(`https://graph.facebook.com/${this.config.apiVersion}/${metaId(id)}`);
    if (this.config.appSecret) url.searchParams.set("appsecret_proof", createHmac("sha256", this.config.appSecret).update(this.config.accessToken).digest("hex"));
    try {
      const response = await this.transport(url, { method: "POST", cache: "no-store", redirect: "error", headers: { Authorization: `Bearer ${this.config.accessToken}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ status: "PAUSED" }) });
      const payload = record(await response.json());
      if (response.ok && payload.success === true) return "ACKNOWLEDGED";
      return response.status >= 400 && response.status < 500 && payload.error ? "REJECTED" : "AMBIGUOUS";
    } catch { return "AMBIGUOUS"; }
  }
}
