"use server";

import { revalidatePath } from "next/cache";
import { FilterSyncError, syncFilter, type FilterSyncSummary } from "@/lib/filter/sync";
import { buildManualMetricUpdate } from "@/lib/filter/manual-metric";
import { campaignModeWhere, getCampaignWorkspaceDetail } from "@/lib/filter/queries";
import type { HistoryParams } from "@/lib/filter/server-pagination";
import { campaignModeConfig, type CampaignMode } from "@/lib/filter/campaign-modes";
import { prisma } from "@/lib/prisma";

export type FilterSyncActionState = { success: boolean; message: string; summary?: FilterSyncSummary };

export async function syncFilterAction(shopeeAccountId: number, previousState: FilterSyncActionState): Promise<FilterSyncActionState> {
  void previousState;
  try {
    const summary = await syncFilter(shopeeAccountId);
    revalidatePath(`/shopee/${shopeeAccountId}/filter`);
    return {
      success: summary.wlFailed === 0,
      message: summary.wlFailed === 0 ? "Sync Meta Filter selesai." : `Sync selesai dengan ${summary.wlFailed} WL gagal.`,
      summary,
    };
  } catch (error) {
    return { success: false, message: error instanceof FilterSyncError ? error.message : "Sync Meta Filter gagal. Coba kembali setelah beberapa saat." };
  }
}

export type ManualMetricActionState = { success: boolean; message: string };

export async function getFilterCampaignDetailAction(shopeeAccountId: number, mode: CampaignMode, campaignId: number, params: HistoryParams) {
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
