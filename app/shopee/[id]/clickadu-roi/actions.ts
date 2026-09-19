"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../../../../lib/auth/session";
import { prisma } from "../../../../lib/prisma";
import { publicClickaduConfigMessage } from "../../../../lib/clickadu-roi/config-input";
import { buildClickaduRoiAnalysis, ClickaduAnalysisError, publicClickaduAnalysisMessage } from "../../../../lib/clickadu-roi/analyze";
import { getClickaduClient } from "../../../../lib/clickadu-roi/config";
import { BlacklistReplacementError, replaceClickaduBlacklist } from "../../../../lib/clickadu-roi/blacklist";
import { readCsvUpload } from "../../../../lib/shopee-import/upload";
import { TrafficProvider } from "../../../../lib/generated/prisma/client";
import { decryptTrafficSecret, encryptTrafficSecret } from "../../../../lib/traffic-credentials/crypto";
import { deleteTrafficCredential, getEncryptedTrafficCredential, saveTrafficCredential } from "../../../../lib/traffic-credentials/repository";
import { markBlacklistReplaced, runVerifiedBlacklistReplacement } from "../../../../lib/traffic-roi/replacement-timestamp";
import {
  deleteClickaduConfig,
  getClickaduConfigById,
  getClickaduConfigPageData,
  saveClickaduConfig,
} from "../../../../lib/clickadu-roi/config-repository";
import { ClickaduDailySyncError, indonesiaToday, syncClickaduDailyMetrics } from "../../../../lib/clickadu-history/daily-sync";
import { upsertClickaduDailyMetric } from "../../../../lib/clickadu-history/persistence";
import { getClickaduCampaignList, getClickaduDailyHistory, type ClickaduHistoryParams } from "../../../../lib/clickadu-history/queries";
import { ClickaduApiError } from "../../../../lib/clickadu-roi/client";

export async function syncClickaduDailyAction(shopeeAccountId: number, targetDate: string) {
  await requireUser();
  try {
    const credential = await getEncryptedTrafficCredential(prisma, shopeeAccountId, TrafficProvider.CLICKADU);
    if (!credential) throw new ClickaduDailySyncError("Koneksi Clickadu belum dikonfigurasi.");
    const client = getClickaduClient(decryptTrafficSecret(credential.encryptedSecret));
    const result = await syncClickaduDailyMetrics(
      { shopeeAccountId, targetDate, today: indonesiaToday() },
      {
        loadConfigs: (accountId) => getClickaduCampaignList(prisma, accountId),
        getStatistics: (input) => client.getZoneStatistics(input),
        getCampaign: (campaignId) => client.getCampaign(campaignId),
        persist: (input) => upsertClickaduDailyMetric(prisma, input),
      },
    );
    revalidatePath(`/shopee/${shopeeAccountId}/clickadu-roi`);
    return { success: true as const, message: `${result.configCount} campaign Clickadu disinkronkan untuk ${result.targetDate}.` };
  } catch (error) {
    const message = error instanceof ClickaduDailySyncError || error instanceof ClickaduApiError
      ? error.message
      : "Sync laporan harian Clickadu gagal.";
    return { success: false as const, message };
  }
}

export async function getClickaduDailyHistoryAction(
  shopeeAccountId: number,
  configId: number,
  params: ClickaduHistoryParams,
) {
  await requireUser();
  const safeParams: ClickaduHistoryParams = {
    page: Number.isSafeInteger(params.page) && params.page > 0 ? params.page : 1,
    pageSize: [25, 50, 100].includes(params.pageSize) ? params.pageSize : 25,
    dir: params.dir === "asc" ? "asc" : "desc",
  };
  try {
    const data = await getClickaduDailyHistory(prisma, shopeeAccountId, configId, safeParams);
    return data
      ? { success: true as const, data }
      : { success: false as const, message: "Histori campaign Clickadu tidak ditemukan." };
  } catch {
    return { success: false as const, message: "Histori harian Clickadu gagal dimuat." };
  }
}

export async function analyzeClickaduRoiAction(shopeeAccountId: number, formData: FormData) {
  await requireUser();
  try {
    const upload = await readCsvUpload(shopeeAccountId, formData);
    const analysis = await buildClickaduRoiAnalysis({
      shopeeAccountId,
      configId: formData.get("configId"),
      dateFrom: formData.get("dateFrom"),
      dateTill: formData.get("dateTill"),
      fxRate: formData.get("fxRate"),
      ...upload,
    }, {
      loadConfig: (accountId, configId) => getClickaduConfigById(prisma, accountId, configId),
      getStatistics: async (input) => {
        const credential = await getEncryptedTrafficCredential(prisma, shopeeAccountId, TrafficProvider.CLICKADU);
        if (!credential) throw new ClickaduAnalysisError("Koneksi Clickadu belum dikonfigurasi.");
        return getClickaduClient(decryptTrafficSecret(credential.encryptedSecret)).getZoneStatistics(input);
      },
    });
    return { success: true as const, analysis };
  } catch (error) {
    return { success: false as const, message: publicClickaduAnalysisMessage(error) };
  }
}

export async function replaceClickaduBlacklistAction(shopeeAccountId: number, formData: FormData) {
  await requireUser();
  try {
    const upload = await readCsvUpload(shopeeAccountId, formData);
    const credential = await getEncryptedTrafficCredential(prisma, shopeeAccountId, TrafficProvider.CLICKADU);
    if (!credential) throw new ClickaduAnalysisError("Koneksi Clickadu belum dikonfigurasi.");
    const client = getClickaduClient(decryptTrafficSecret(credential.encryptedSecret));
    const analysis = await buildClickaduRoiAnalysis({
      shopeeAccountId,
      configId: formData.get("configId"),
      dateFrom: formData.get("dateFrom"),
      dateTill: formData.get("dateTill"),
      fxRate: formData.get("fxRate"),
      ...upload,
    }, {
      loadConfig: (accountId, configId) => getClickaduConfigById(prisma, accountId, configId),
      getStatistics: (input) => client.getZoneStatistics(input),
    });
    const result = await runVerifiedBlacklistReplacement(
      () => replaceClickaduBlacklist(analysis.config.campaignId, analysis.analysis.candidateZones, client),
      (at) => markBlacklistReplaced(prisma, "CLICKADU", shopeeAccountId, analysis.config.id, at),
    );
    if (result.status === "UPDATED") revalidatePath(`/shopee/${shopeeAccountId}/clickadu-roi`);
    return { success: true as const, status: result.status, blockedZoneCount: result.blockedZoneCount, lastBlacklistReplacedAt: result.lastBlacklistReplacedAt };
  } catch (error) {
    const message = error instanceof BlacklistReplacementError ? error.message : publicClickaduAnalysisMessage(error);
    return { success: false as const, message };
  }
}

export async function saveClickaduCredentialAction(shopeeAccountId: number, formData: FormData) {
  await requireUser();
  try {
    const token = formData.get("token");
    if (typeof token !== "string" || !token.trim()) return { success: false as const, message: "API Token wajib diisi." };
    await saveTrafficCredential(prisma, shopeeAccountId, TrafficProvider.CLICKADU, encryptTrafficSecret(token.trim()));
    revalidatePath(`/shopee/${shopeeAccountId}/clickadu-roi`);
    return { success: true as const };
  } catch {
    return { success: false as const, message: "Gagal menyimpan koneksi Clickadu." };
  }
}

export async function deleteClickaduCredentialAction(shopeeAccountId: number) {
  await requireUser();
  try {
    const deleted = await deleteTrafficCredential(prisma, shopeeAccountId, TrafficProvider.CLICKADU);
    if (!deleted) return { success: false as const, message: "Koneksi Clickadu tidak ditemukan." };
    revalidatePath(`/shopee/${shopeeAccountId}/clickadu-roi`);
    return { success: true as const };
  } catch {
    return { success: false as const, message: "Gagal memutuskan koneksi Clickadu." };
  }
}

export async function listClickaduConfigsAction(shopeeAccountId: number) {
  await requireUser();
  return getClickaduConfigPageData(prisma, shopeeAccountId);
}

export async function saveClickaduConfigAction(shopeeAccountId: number, formData: FormData) {
  await requireUser();
  try {
    const config = await saveClickaduConfig(prisma, shopeeAccountId, {
      id: formData.get("configId") || undefined,
      campaignId: formData.get("campaignId"),
      label: formData.get("label"),
      sourceTag: formData.get("sourceTag"),
    });
    revalidatePath(`/shopee/${shopeeAccountId}/clickadu-roi`);
    return { success: true as const, config };
  } catch (error) {
    return { success: false as const, message: publicClickaduConfigMessage(error) };
  }
}

export async function deleteClickaduConfigAction(shopeeAccountId: number, configId: number) {
  await requireUser();
  try {
    await deleteClickaduConfig(prisma, shopeeAccountId, configId);
    revalidatePath(`/shopee/${shopeeAccountId}/clickadu-roi`);
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: publicClickaduConfigMessage(error) };
  }
}
