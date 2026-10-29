"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireUser } from "../../../../lib/auth/session";
import { prisma } from "../../../../lib/prisma";
import { TrafficProvider } from "../../../../lib/generated/prisma/client";
import { decryptTrafficSecret, encryptTrafficSecret } from "../../../../lib/traffic-credentials/crypto";
import { deleteTrafficCredential, getEncryptedTrafficCredential, saveTrafficCredential } from "../../../../lib/traffic-credentials/repository";
import { getAdsterraClient } from "../../../../lib/adsterra-roi/config";
import { buildAdsterraRoiAnalysis, AdsterraAnalysisError, publicAdsterraAnalysisMessage } from "../../../../lib/adsterra-roi/analyze";
import { getAdsterraConfigById } from "../../../../lib/adsterra-roi/config-repository";
import { publicAdsterraConfigMessage } from "../../../../lib/adsterra-roi/config-input";
import { readCsvUpload } from "../../../../lib/shopee-import/upload";
import { AdsterraDailySyncError, indonesiaToday, syncAdsterraDailyMetrics } from "../../../../lib/adsterra-history/daily-sync";
import { persistAdsterraDailyMetricAndCheckpoint } from "../../../../lib/adsterra-history/persistence";
import { getAdsterraDailyHistory, getAdsterraDailySyncConfigs } from "../../../../lib/adsterra-history/queries";
import { parseAdsterraHistoryParams, type AdsterraHistoryParams } from "../../../../lib/adsterra-history/server-pagination";
import { AdsterraApiError, type AdsterraCampaignStatusResult } from "../../../../lib/adsterra-roi/client";
import { OperationBudget } from "@/lib/adsterra-operations/budget";
import { requireOperationUser } from "@/lib/adsterra-operations/runtime";
import { OperationError } from "@/lib/adsterra-operations/types";
import { coordinatedAutoDisable, coordinatedAutoEnable, coordinatedCampaignActivity, coordinatedConfigChange, runCoordinatedWrite } from "@/lib/adsterra-operations/coordinated-writes";
import { loadAdsterraCustomBids } from "../../../../lib/adsterra-roi/custom-bids";
import { AdsterraCustomBidWriteError, readAdsterraCustomBidExperiment, writeAdsterraPlacementCustomBid } from "../../../../lib/adsterra-roi/custom-bid-write";
import type { AdsterraCustomBidsResult } from "../../../../lib/adsterra-roi/types";

function campaignStatusErrorMessage(error: unknown) {
  return error instanceof AdsterraApiError ? error.message : "Status campaign Adsterra gagal dimuat.";
}

async function scopedAdsterraClient(shopeeAccountId: number) {
  const credential = await getEncryptedTrafficCredential(prisma, shopeeAccountId, TrafficProvider.ADSTERRA);
  if (!credential) throw new AdsterraApiError("Koneksi Adsterra belum dikonfigurasi.");
  return getAdsterraClient(decryptTrafficSecret(credential.encryptedSecret));
}

export async function getAdsterraCustomBidsAction(shopeeAccountId: number, configId: number): Promise<AdsterraCustomBidsResult> {
  await requireUser();
  try {
    const bids = await loadAdsterraCustomBids(shopeeAccountId, configId, {
      loadConfig: (accountId, id) => getAdsterraConfigById(prisma, accountId, id),
      loadClient: scopedAdsterraClient,
    });
    return { success: true, bids };
  } catch (error) {
    return { success: false, message: error instanceof AdsterraApiError ? error.message : "Custom Bid Adsterra gagal dimuat." };
  }
}

function customBidWriteMessage(error: unknown) {
  return error instanceof AdsterraCustomBidWriteError || error instanceof AdsterraApiError || error instanceof OperationError
    ? error.message : "Gagal memperbarui Custom Bid Adsterra.";
}

async function customBidExperiment() {
  const requestHeaders = await headers();
  return readAdsterraCustomBidExperiment(process.env, requestHeaders.get("host"), requestHeaders.get("origin"));
}

export async function saveAdsterraCustomBidAction(
  shopeeAccountId: number, configId: number, placementId: string, price: string, expectedPrice: string | null,
) {
  const budget = new OperationBudget(), owner = await requireOperationUser(budget);
  try {
    const result = await runCoordinatedWrite({ accountId: shopeeAccountId, configId, owner, action: "CUSTOM_BID_SAVE", budget }, async (provider) => writeAdsterraPlacementCustomBid({
      shopeeAccountId, configId, placementId, price, expectedPrice, operation: "SAVE",
    }, {
      experiment: await customBidExperiment(),
      allowCreate: process.env.ADSTERRA_CUSTOM_BID_CREATE_ENABLED === "1",
      loadConfig: (accountId, id) => budget.wait(getAdsterraConfigById(prisma, accountId, id)),
      loadClient: async () => provider.bidClient(),
    }), () => true);
    if (result.status === "UPDATED") revalidatePath(`/shopee/${shopeeAccountId}/adsterra-roi`);
    return { success: true as const, ...result };
  } catch (error) {
    return { success: false as const, message: customBidWriteMessage(error) };
  }
}

export async function deleteAdsterraCustomBidAction(
  shopeeAccountId: number, configId: number, placementId: string, expectedPrice: string | null,
) {
  const budget = new OperationBudget(), owner = await requireOperationUser(budget);
  try {
    const result = await runCoordinatedWrite({ accountId: shopeeAccountId, configId, owner, action: "CUSTOM_BID_DELETE", budget }, async (provider) => writeAdsterraPlacementCustomBid({
      shopeeAccountId, configId, placementId, expectedPrice, operation: "DELETE",
    }, {
      experiment: await customBidExperiment(),
      loadConfig: (accountId, id) => budget.wait(getAdsterraConfigById(prisma, accountId, id)),
      loadClient: async () => provider.bidClient(),
    }), () => true);
    if (result.status === "UPDATED") revalidatePath(`/shopee/${shopeeAccountId}/adsterra-roi`);
    return { success: true as const, ...result };
  } catch (error) {
    return { success: false as const, message: customBidWriteMessage(error) };
  }
}

export async function getAdsterraCampaignStatusesAction(shopeeAccountId: number) {
  await requireUser();
  try {
    const account = await prisma.shopeeAccount.findUnique({ where: { id: shopeeAccountId }, select: { id: true } });
    if (!account) return { success: false as const, message: "Akun Shopee tidak ditemukan." };
    const configs = await prisma.adsterraCampaignConfig.findMany({ where: { shopeeAccountId }, select: { id: true, campaignId: true, autoScheduleEnabled: true }, orderBy: { id: "asc" } });
    if (configs.length === 0) return { success: true as const, statuses: [] };
    const statuses: Array<{ configId: number; autoScheduleEnabled: boolean; campaignStatus: AdsterraCampaignStatusResult | null; error: string | null }> = [];
    let client: Awaited<ReturnType<typeof scopedAdsterraClient>>;
    try { client = await scopedAdsterraClient(shopeeAccountId); }
    catch (error) {
      // Auto flags remain authoritative even without provider credentials.
      return { success: true as const, statuses: configs.map((config) => ({ configId: config.id,
        autoScheduleEnabled: config.autoScheduleEnabled, campaignStatus: null, error: campaignStatusErrorMessage(error) })) };
    }
    for (const config of configs) {
      try {
        statuses.push({ configId: config.id, autoScheduleEnabled: config.autoScheduleEnabled, campaignStatus: await client.getCampaignStatus(config.campaignId), error: null });
      } catch (error) {
        statuses.push({ configId: config.id, autoScheduleEnabled: config.autoScheduleEnabled, campaignStatus: null, error: campaignStatusErrorMessage(error) });
      }
    }
    return { success: true as const, statuses };
  } catch (error) {
    return { success: false as const, message: campaignStatusErrorMessage(error) };
  }
}

export async function setAdsterraCampaignActiveAction(shopeeAccountId: number, configId: number, desiredActive: boolean) {
  const budget = new OperationBudget(), owner = await requireOperationUser(budget);
  try {
    if (typeof desiredActive !== "boolean") return { success: false as const, message: "Status campaign Adsterra tidak valid." };
    const result = await coordinatedCampaignActivity(shopeeAccountId, configId, owner, desiredActive, budget);
    if (!result.verified) {
      return { success: false as const, message: `Status campaign belum sesuai. Status aktual: ${campaignStatusLabel(result.actual.status)}.`, campaignStatus: result.actual };
    }
    revalidatePath(`/shopee/${shopeeAccountId}/adsterra-roi`);
    return { success: true as const, campaignStatus: result.actual };
  } catch (error) {
    return { success: false as const, message: error instanceof AdsterraApiError || error instanceof OperationError ? error.message : "Status campaign Adsterra gagal diperbarui; periksa guard/migrasi operasi sebelum retry." };
  }
}

export async function setAdsterraAutoScheduleEnabledAction(shopeeAccountId: number, configId: number, enabled: boolean) {
  const budget = new OperationBudget(), owner = await requireOperationUser(budget);
  try {
    if (typeof enabled !== "boolean") throw new OperationError("Status Auto ON/OFF tidak valid.");
    const result = enabled ? await coordinatedAutoEnable(shopeeAccountId, configId, owner, budget)
      : await coordinatedAutoDisable(shopeeAccountId, configId, budget);
    revalidatePath(`/shopee/${shopeeAccountId}/adsterra-roi`);
    return { success: true as const, ...result };
  } catch (error) {
    return { success: false as const, message: error instanceof OperationError ? error.message : publicAdsterraConfigMessage(error) };
  }
}

function campaignStatusLabel(status: AdsterraCampaignStatusResult["status"]) {
  return status === "ACTIVE" ? "Active" : status === "INACTIVE" ? "Inactive" : status === "LIMITED" ? "Limit" : "Not in use";
}

export async function syncAdsterraDailyAction(shopeeAccountId: number) { await requireUser(); try { const credential = await getEncryptedTrafficCredential(prisma, shopeeAccountId, TrafficProvider.ADSTERRA); if (!credential) throw new AdsterraDailySyncError("Koneksi Adsterra belum dikonfigurasi."); const client = getAdsterraClient(decryptTrafficSecret(credential.encryptedSecret)); const result = await syncAdsterraDailyMetrics({ shopeeAccountId, today: indonesiaToday() }, { loadConfigs: (id) => getAdsterraDailySyncConfigs(prisma, id), getStatistics: (input) => client.getPlacementStatistics(input), persistDay: (input) => persistAdsterraDailyMetricAndCheckpoint(prisma, input) }); revalidatePath(`/shopee/${shopeeAccountId}/adsterra-roi`); const coverage = result.from && result.through ? ` (${result.from}–${result.through})` : ""; return { success: true as const, message: `${result.configCount} campaign, ${result.dateCount} tanggal berhasil disinkronkan${coverage}.` }; } catch (error) { return { success: false as const, message: error instanceof AdsterraDailySyncError || error instanceof AdsterraApiError ? error.message : "Sync laporan harian Adsterra gagal." }; } }

export async function getAdsterraDailyHistoryAction(shopeeAccountId: number, configId: number, params: AdsterraHistoryParams) { await requireUser(); try { const data = await getAdsterraDailyHistory(prisma, shopeeAccountId, configId, parseAdsterraHistoryParams(params)); return data ? { success: true as const, data } : { success: false as const, message: "Histori campaign Adsterra tidak ditemukan." }; } catch { return { success: false as const, message: "Histori harian Adsterra gagal dimuat." }; } }

export async function analyzeAdsterraRoiAction(shopeeAccountId: number, formData: FormData) { await requireUser(); try { const upload = await readCsvUpload(shopeeAccountId, formData); const result = await buildAdsterraRoiAnalysis({ shopeeAccountId, configId: formData.get("configId"), dateFrom: formData.get("dateFrom"), dateTill: formData.get("dateTill"), fxRate: formData.get("fxRate"), ...upload }, { loadConfig: (accountId, configId) => getAdsterraConfigById(prisma, accountId, configId), getStatistics: async (input) => { const credential = await getEncryptedTrafficCredential(prisma, shopeeAccountId, TrafficProvider.ADSTERRA); if (!credential) throw new AdsterraAnalysisError("Koneksi Adsterra belum dikonfigurasi."); return getAdsterraClient(decryptTrafficSecret(credential.encryptedSecret)).getPlacementStatistics(input); } }); return { success: true as const, result }; } catch (error) { return { success: false as const, message: publicAdsterraAnalysisMessage(error) }; } }
export async function replaceAdsterraBlacklistAction(shopeeAccountId: number, formData: FormData) {
  await requireOperationUser(new OperationBudget());
  void shopeeAccountId; void formData;
  // A stale tab/action must not bypass signed opposite-list/bid confirmation.
  return { success: false as const, message: "Alur lama tidak menjalankan write. Gunakan Siapkan Penerapan pada analisis untuk konfirmasi daftar dan dampak Custom Bid terbaru." };
}
export async function saveAdsterraCredentialAction(shopeeAccountId: number, formData: FormData) { await requireUser(); try { const key = formData.get("apiKey"); if (typeof key !== "string" || !key.trim()) return { success: false as const, message: "API Key wajib diisi." }; await saveTrafficCredential(prisma, shopeeAccountId, TrafficProvider.ADSTERRA, encryptTrafficSecret(key.trim())); revalidatePath(`/shopee/${shopeeAccountId}/adsterra-roi`); return { success: true as const }; } catch { return { success: false as const, message: "Gagal menyimpan koneksi Adsterra." }; } }
export async function deleteAdsterraCredentialAction(shopeeAccountId: number) { await requireUser(); try { if (!await deleteTrafficCredential(prisma, shopeeAccountId, TrafficProvider.ADSTERRA)) return { success: false as const, message: "Koneksi Adsterra tidak ditemukan." }; revalidatePath(`/shopee/${shopeeAccountId}/adsterra-roi`); return { success: true as const }; } catch { return { success: false as const, message: "Gagal memutuskan koneksi Adsterra." }; } }
export async function saveAdsterraConfigAction(shopeeAccountId: number, formData: FormData) { const budget = new OperationBudget(), owner = await requireOperationUser(budget); try { await coordinatedConfigChange(shopeeAccountId, { id: formData.get("configId") || undefined, campaignId: formData.get("campaignId"), label: formData.get("label"), sourceTag: formData.get("sourceTag") }, owner, budget); revalidatePath(`/shopee/${shopeeAccountId}/adsterra-roi`); return { success: true as const }; } catch (error) { return { success: false as const, message: error instanceof OperationError ? error.message : publicAdsterraConfigMessage(error) }; } }
export async function deleteAdsterraConfigAction(shopeeAccountId: number, configId: number) { const budget = new OperationBudget(), owner = await requireOperationUser(budget); try { await coordinatedConfigChange(shopeeAccountId, configId, owner, budget); revalidatePath(`/shopee/${shopeeAccountId}/adsterra-roi`); return { success: true as const }; } catch (error) { return { success: false as const, message: error instanceof OperationError ? error.message : publicAdsterraConfigMessage(error) }; } }
