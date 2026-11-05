import "server-only";

import { MetaReadError } from "@/lib/meta-campaign-controls/parse";
import type { MetaCampaignReadClient, MetaReadPage } from "@/lib/meta-campaign-controls/read-client";
import { normalizeMetaCampaignSettings } from "./normalize";
import type { MetaCampaignSettingsView } from "./types";

type SettingsClient = Pick<MetaCampaignReadClient, "readSettingsPage" | "page" | "claimObject" | "safeText">;

async function readEdge(client: SettingsClient, campaignId: string, edge: "adsets" | "ads") {
  const rows: unknown[] = [];
  const ids = new Set<string>();
  const cursors = new Set<string>();
  let after: string | undefined;
  do {
    const payload = await client.readSettingsPage(campaignId, edge, after);
    const page: MetaReadPage = client.page(payload);
    for (const row of page.rows) {
      client.claimObject();
      if (!row || typeof row !== "object" || Array.isArray(row)) throw new MetaReadError("INVALID_RESPONSE", "Objek pengaturan Meta tidak valid.");
      const fields = row as Record<string, unknown>;
      if (typeof fields.id !== "string" || !/^[0-9]{1,100}$/.test(fields.id) || ids.has(fields.id)) throw new MetaReadError("INTEGRITY", "ID objek pengaturan Meta tidak valid atau duplikat.");
      if (fields.campaign_id !== campaignId) throw new MetaReadError("INTEGRITY", "Objek pengaturan Meta berada di luar campaign yang dipilih.");
      ids.add(fields.id);
      rows.push(row);
    }
    if (page.after && cursors.has(page.after)) throw new MetaReadError("INTEGRITY", "Cursor pagination Meta berulang.");
    if (page.after) cursors.add(page.after);
    after = page.after ?? undefined;
  } while (after);
  return rows;
}

export async function readMetaCampaignSettings(campaignId: string, client: SettingsClient): Promise<MetaCampaignSettingsView> {
  const warnings: string[] = [];
  let complete = true;
  let adSets: unknown[] = [];
  let ads: unknown[] = [];
  try { adSets = await readEdge(client, campaignId, "adsets"); }
  catch (error) {
    if (error instanceof MetaReadError && error.kind === "INTEGRITY") throw error;
    complete = false;
    warnings.push(client.safeText(error instanceof Error ? error.message : "Daftar Set Iklan belum dapat dibaca."));
  }
  try { ads = await readEdge(client, campaignId, "ads"); }
  catch (error) {
    if (error instanceof MetaReadError && error.kind === "INTEGRITY") throw error;
    complete = false;
    warnings.push(client.safeText(error instanceof Error ? error.message : "Daftar iklan belum dapat dibaca."));
  }
  return normalizeMetaCampaignSettings({ adSets, ads, complete, warnings });
}
