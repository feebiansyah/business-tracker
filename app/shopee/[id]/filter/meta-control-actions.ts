"use server";

import { requireUser } from "@/lib/auth/session";
import { loadPreviewTarget, parsePreviewInput } from "@/lib/meta-campaign-controls/scope";
import { readCampaignPreview } from "@/lib/meta-campaign-controls/preview";
import { MetaCampaignReadClient } from "@/lib/meta-campaign-controls/read-client";
import type { PreviewResult } from "@/lib/meta-campaign-controls/types";

export async function getMetaCampaignPreviewAction(input: unknown): Promise<PreviewResult> {
  const startedAt = Date.now();
  const deadline = startedAt + 60_000;
  const timeoutError = new Error("Preview deadline exceeded");
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { expired = true; reject(timeoutError); }, Math.max(0, deadline - Date.now()));
  });
  const checkDeadline = () => { if (expired || Date.now() >= deadline) throw timeoutError; };
  async function withinBudget<T>(operation: () => Promise<T>): Promise<T> {
    checkDeadline();
    // Only bound waiting: a timed-out database read may still finish, but cannot start the next phase.
    const result = await Promise.race([timeout, operation()]);
    checkDeadline();
    return result;
  }
  try {
    // Keep auth outside the generic provider/lookup catch so Next.js redirects propagate unchanged.
    await withinBudget(() => requireUser({ readOnly: true }));
    let parsed;
    try { parsed = parsePreviewInput(input); }
    catch { return { success: false, message: "Target preview tidak valid. Hanya campaign dalam Filter/Fix yang dapat dibaca." }; }
    try {
      const target = await withinBudget(() => loadPreviewTarget(parsed));
      if (!target) return { success: false, message: "Campaign tidak ditemukan dalam scope Shopee dan Filter/Fix yang dipilih." };
      return await withinBudget(() => readCampaignPreview(target, new MetaCampaignReadClient(undefined, undefined, Date.now, startedAt)));
    } catch (error) {
      if (error === timeoutError) throw error;
      return { success: false, message: "Preview belum dapat dibaca. Periksa akses database/konfigurasi Meta, lalu coba kembali. Tidak ada data yang ditulis." };
    }
  } catch (error) {
    if (error !== timeoutError) throw error;
    return { success: false, kind: "LIMIT", message: "Budget preview 60 detik habis, termasuk autentikasi dan lookup target. Hasil terlambat diabaikan; query database belum tentu dibatalkan. Coba Refresh manual." };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
