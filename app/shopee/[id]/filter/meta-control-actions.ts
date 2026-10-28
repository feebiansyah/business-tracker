"use server";

import { requireUser } from "@/lib/auth/session";
import { loadPreviewTarget, parsePreviewInput } from "@/lib/meta-campaign-controls/scope";
import { readCampaignPreview } from "@/lib/meta-campaign-controls/preview";
import { MetaCampaignReadClient } from "@/lib/meta-campaign-controls/read-client";
import type { PreviewResult } from "@/lib/meta-campaign-controls/types";

export async function getMetaCampaignPreviewAction(input: unknown): Promise<PreviewResult> {
  await requireUser({ readOnly: true });
  const startedAt = Date.now();
  let parsed;
  try { parsed = parsePreviewInput(input); }
  catch { return { success: false, message: "Target preview tidak valid. Hanya campaign dalam Filter/Fix yang dapat dibaca." }; }
  try {
    const target = await loadPreviewTarget(parsed);
    if (!target) return { success: false, message: "Campaign tidak ditemukan dalam scope Shopee dan Filter/Fix yang dipilih." };
    return await readCampaignPreview(target, new MetaCampaignReadClient(undefined, undefined, Date.now, startedAt));
  } catch {
    return { success: false, message: "Preview belum dapat dibaca. Periksa akses database/konfigurasi Meta, lalu coba kembali. Tidak ada data yang ditulis." };
  }
}
