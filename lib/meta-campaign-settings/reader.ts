import "server-only";

import { MetaReadError } from "@/lib/meta-campaign-controls/parse";
import type { MetaCampaignReadClient, MetaReadPage } from "@/lib/meta-campaign-controls/read-client";
import { creativeKinds, normalizeMetaCampaignSettings } from "./normalize";
import type { MetaCampaignSettingsView } from "./types";

type SettingsClient = Pick<MetaCampaignReadClient, "readSettingsPage" | "readStoryAttachments" | "page" | "claimObject" | "safeText">;

type RecordValue = Record<string, unknown>;
const asRecord = (value: unknown): RecordValue | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;

function attachmentTypes(value: unknown): Array<"Video" | "Gambar" | "Carousel"> {
  const entry = asRecord(value);
  const attachments = entry && asRecord(entry.attachments);
  if (!attachments || !Array.isArray(attachments.data)) return [];
  const result: Array<"Video" | "Gambar" | "Carousel"> = [];
  for (const raw of attachments.data) {
    const attachment = asRecord(raw);
    if (!attachment) continue;
    const media = typeof attachment.media_type === "string" ? attachment.media_type.toLowerCase() : "";
    const type = typeof attachment.type === "string" ? attachment.type.toLowerCase() : "";
    const sub = asRecord(attachment.subattachments);
    if (sub && Array.isArray(sub.data) && sub.data.length > 1) result.push("Carousel");
    else if (media.includes("video") || type.includes("video")) result.push("Video");
    else if (media.includes("photo") || media.includes("image") || type.includes("photo")) result.push("Gambar");
    else if (media.includes("album") || type.includes("album") || type.includes("multi_share")) result.push("Carousel");
  }
  return [...new Set(result)];
}

async function resolveExistingPostTypes(client: SettingsClient, ads: unknown[]) {
  const unresolved = new Set<string>();
  for (const raw of ads) {
    const ad = asRecord(raw);
    const creative = ad && asRecord(ad.creative);
    const storyId = creative?.effective_object_story_id;
    if (creative && creativeKinds(creative).length === 0 && typeof storyId === "string" && /^[0-9]{1,100}_[0-9]{1,100}$/.test(storyId)) unresolved.add(storyId);
  }
  if (!unresolved.size) return { ads, complete: true, warnings: [] as string[] };
  const resolved = new Map<string, Array<"Video" | "Gambar" | "Carousel">>();
  const ids = [...unresolved];
  for (let index = 0; index < ids.length; index += 50) {
    const batch = ids.slice(index, index + 50);
    const payload = await client.readStoryAttachments(batch);
    for (const storyId of batch) resolved.set(storyId, attachmentTypes(payload[storyId]));
  }
  const stillUnknown = ids.filter((storyId) => !(resolved.get(storyId)?.length));
  const enriched = ads.map((raw) => {
    const ad = asRecord(raw);
    const creative = ad && asRecord(ad.creative);
    const storyId = creative?.effective_object_story_id;
    const types = typeof storyId === "string" ? resolved.get(storyId) : undefined;
    return ad && creative && types?.length ? { ...ad, creative: { ...creative, resolved_content_types: types } } : raw;
  });
  return { ads: enriched, complete: stillUnknown.length === 0, warnings: stillUnknown.length ? ["Jenis konten beberapa postingan existing tidak tersedia dari Meta."] : [] };
}

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
  if (ads.length) try {
    const fallback = await resolveExistingPostTypes(client, ads);
    ads = fallback.ads;
    if (!fallback.complete) complete = false;
    warnings.push(...fallback.warnings);
  } catch (error) {
    if (error instanceof MetaReadError && error.kind === "INTEGRITY") throw error;
    complete = false;
    warnings.push(client.safeText("Jenis konten postingan existing belum dapat dibaca dari Meta."));
  }
  return normalizeMetaCampaignSettings({ adSets, ads, complete, warnings });
}
