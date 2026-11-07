"use server";

import { revalidatePath } from "next/cache";
import { FilterSyncError, type FilterSyncSummary } from "@/lib/filter/sync";
import { randomUUID } from "node:crypto";
import { runMetaSyncBatch, type MetaSyncBatchResult } from "@/lib/filter/meta-sync-batch";
import { buildManualMetricUpdate } from "@/lib/filter/manual-metric";
import { campaignModeWhere, getCampaignWorkspaceDetail } from "@/lib/filter/queries";
import type { HistoryParams } from "@/lib/filter/server-pagination";
import { campaignModeConfig, type CampaignMode } from "@/lib/filter/campaign-modes";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";

export type FilterSyncActionState = { success: boolean; message: string; summary?: FilterSyncSummary; metaBatch?: MetaSyncBatchResult };

export async function syncFilterAction(shopeeAccountId: number, previousState: FilterSyncActionState): Promise<FilterSyncActionState> {
  const startedAt = Date.now();
  await requireUser();
  void previousState;
  try {
    const metaBatch = await runMetaSyncBatch({ shopeeAccountId, owner: randomUUID(), startedAt });
    const summary = metaBatch.progress.summary;
    revalidatePath(`/shopee/${shopeeAccountId}`);
    revalidatePath(`/shopee/${shopeeAccountId}/filter`);
    revalidatePath(`/shopee/${shopeeAccountId}/fix`);
    revalidatePath(`/shopee/${shopeeAccountId}/off-filter`);
    revalidatePath(`/shopee/${shopeeAccountId}/off-fix`);
    revalidatePath("/wl");
    return {
      success: metaBatch.progress.status === "COMPLETE",
      message: metaBatch.blocked ? "Sync sedang berjalan pada permintaan lain. Progres dapat dilanjutkan setelah unit tersebut selesai." : metaBatch.paused ? metaBatch.progress.message ?? "Sync dijeda. Progres tersimpan dapat dilanjutkan." : metaBatch.progress.status === "COMPLETE" ? "Sync Meta selesai." : metaBatch.progress.status === "PARTIAL" ? `Sync selesai dengan ${summary.wlFailed} WL gagal.` : "Sync Meta berlangsung.",
      summary,
      metaBatch,
    };
  } catch (error) {
    return { success: false, message: error instanceof FilterSyncError ? error.message : "Sync Meta Filter gagal. Coba kembali setelah beberapa saat." };
  }
}

export type ManualMetricActionState = { success: boolean; message: string };

export async function getFilterCampaignDetailAction(shopeeAccountId: number, mode: CampaignMode, campaignId: number, params: HistoryParams) {
  await requireUser();
  try {
    const data = await getCampaignWorkspaceDetail(shopeeAccountId, mode, campaignId, params);
    return data
      ? { success: true as const, data }
      : { success: false as const, message: `Histori harian tidak ditemukan dalam scope ${campaignModeConfig[mode].title}.` };
  } catch {
    return { success: false as const, message: "Histori harian gagal dimuat." };
  }
}

export async function updateDailyMetricManualAction(
  shopeeAccountId: number,
  mode: CampaignMode,
  campaignId: number,
  metricId: number,
  note: string,
  completed: boolean,
): Promise<ManualMetricActionState> {
  await requireUser();
  if (![shopeeAccountId, campaignId, metricId].every((value) => Number.isInteger(value) && value > 0) || typeof note !== "string" || typeof completed !== "boolean") {
    return { success: false, message: "Data Note/Selesai tidak valid." };
  }
  try {
    const metric = await prisma.campaignDailyMetric.findFirst({
      where: {
        id: metricId,
        campaign: {
          id: campaignId,
          ...campaignModeWhere(mode),
          metaAccount: { shopeeAccountId },
        },
      },
      select: { id: true },
    });
    if (!metric) return { success: false, message: "Histori harian tidak ditemukan dalam scope Filter." };
    await prisma.campaignDailyMetric.update({ where: { id: metric.id }, data: buildManualMetricUpdate(note, completed) });
    return { success: true, message: "Tersimpan" };
  } catch {
    return { success: false, message: "Gagal menyimpan. Coba kembali." };
  }
}
