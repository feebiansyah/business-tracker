"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "../../../../lib/auth/session";
import { prisma } from "../../../../lib/prisma";
import { TrafficProvider } from "../../../../lib/generated/prisma/client";
import { decryptTrafficSecret, encryptTrafficSecret } from "../../../../lib/traffic-credentials/crypto";
import { deleteTrafficCredential, getEncryptedTrafficCredential, saveTrafficCredential } from "../../../../lib/traffic-credentials/repository";
import { getAdsterraClient } from "../../../../lib/adsterra-roi/config";
import { buildAdsterraRoiAnalysis, AdsterraAnalysisError, publicAdsterraAnalysisMessage } from "../../../../lib/adsterra-roi/analyze";
import { AdsterraBlacklistError, replaceAdsterraBlacklist } from "../../../../lib/adsterra-roi/blacklist";
import { deleteAdsterraConfig, getAdsterraConfigById, saveAdsterraConfig } from "../../../../lib/adsterra-roi/config-repository";
import { publicAdsterraConfigMessage } from "../../../../lib/adsterra-roi/config-input";
import { readCsvUpload } from "../../../../lib/shopee-import/upload";
import { markBlacklistReplaced, runVerifiedBlacklistReplacement } from "../../../../lib/traffic-roi/replacement-timestamp";
import { AdsterraDailySyncError, indonesiaToday, syncAdsterraDailyMetrics } from "../../../../lib/adsterra-history/daily-sync";
import { persistAdsterraDailyMetricAndCheckpoint } from "../../../../lib/adsterra-history/persistence";
import { getAdsterraDailyHistory, getAdsterraDailySyncConfigs } from "../../../../lib/adsterra-history/queries";
import { parseAdsterraHistoryParams, type AdsterraHistoryParams } from "../../../../lib/adsterra-history/server-pagination";
import { AdsterraApiError, type AdsterraCampaignStatusResult } from "../../../../lib/adsterra-roi/client";
import { setAndVerifyAdsterraCampaignActive } from "../../../../lib/adsterra-roi/campaign-activity";

function campaignStatusErrorMessage(error: unknown) {
  return error instanceof AdsterraApiError ? error.message : "Status campaign Adsterra gagal dimuat.";
}

async function scopedAdsterraClient(shopeeAccountId: number) {
  const credential = await getEncryptedTrafficCredential(prisma, shopeeAccountId, TrafficProvider.ADSTERRA);
  if (!credential) throw new AdsterraApiError("Koneksi Adsterra belum dikonfigurasi.");
  return getAdsterraClient(decryptTrafficSecret(credential.encryptedSecret));
}

export async function getAdsterraCampaignStatusesAction(shopeeAccountId: number) {
  await requireUser();
  try {
    const account = await prisma.shopeeAccount.findUnique({ where: { id: shopeeAccountId }, select: { id: true } });
    if (!account) return { success: false as const, message: "Akun Shopee tidak ditemukan." };
    const configs = await prisma.adsterraCampaignConfig.findMany({ where: { shopeeAccountId }, select: { id: true, campaignId: true }, orderBy: { id: "asc" } });
    if (configs.length === 0) return { success: true as const, statuses: [] };
    const client = await scopedAdsterraClient(shopeeAccountId);
    const statuses: Array<{ configId: number; campaignStatus: AdsterraCampaignStatusResult | null; error: string | null }> = [];
    for (const config of configs) {
      try {
        statuses.push({ configId: config.id, campaignStatus: await client.getCampaignStatus(config.campaignId), error: null });
      } catch (error) {
        statuses.push({ configId: config.id, campaignStatus: null, error: campaignStatusErrorMessage(error) });
      }
    }
    return { success: true as const, statuses };
  } catch (error) {
    return { success: false as const, message: campaignStatusErrorMessage(error) };
  }
}

export async function setAdsterraCampaignActiveAction(shopeeAccountId: number, configId: number, desiredActive: boolean) {
  await requireUser();
  try {
    if (typeof desiredActive !== "boolean") return { success: false as const, message: "Status campaign Adsterra tidak valid." };
    const config = await getAdsterraConfigById(prisma, shopeeAccountId, configId);
    if (!config) return { success: false as const, message: "Konfigurasi Adsterra tidak ditemukan." };
    const client = await scopedAdsterraClient(shopeeAccountId);
    const result = await setAndVerifyAdsterraCampaignActive(config.campaignId, desiredActive, client);
    if (!result.verified) {
      return { success: false as const, message: `Status campaign belum sesuai. Status aktual: ${campaignStatusLabel(result.actual.status)}.`, campaignStatus: result.actual };
    }
    revalidatePath(`/shopee/${shopeeAccountId}/adsterra-roi`);
    return { success: true as const, campaignStatus: result.actual };
  } catch (error) {
    return { success: false as const, message: error instanceof AdsterraApiError ? error.message : "Status campaign Adsterra gagal diperbarui." };
  }
}

function campaignStatusLabel(status: AdsterraCampaignStatusResult["status"]) {
  return status === "ACTIVE" ? "Active" : status === "INACTIVE" ? "Inactive" : status === "LIMITED" ? "Limit" : "Not in use";
}

export async function syncAdsterraDailyAction(shopeeAccountId: number) { await requireUser(); try { const credential = await getEncryptedTrafficCredential(prisma, shopeeAccountId, TrafficProvider.ADSTERRA); if (!credential) throw new AdsterraDailySyncError("Koneksi Adsterra belum dikonfigurasi."); const client = getAdsterraClient(decryptTrafficSecret(credential.encryptedSecret)); const result = await syncAdsterraDailyMetrics({ shopeeAccountId, today: indonesiaToday() }, { loadConfigs: (id) => getAdsterraDailySyncConfigs(prisma, id), getStatistics: (input) => client.getPlacementStatistics(input), persistDay: (input) => persistAdsterraDailyMetricAndCheckpoint(prisma, input) }); revalidatePath(`/shopee/${shopeeAccountId}/adsterra-roi`); const coverage = result.from && result.through ? ` (${result.from}–${result.through})` : ""; return { success: true as const, message: `${result.configCount} campaign, ${result.dateCount} tanggal berhasil disinkronkan${coverage}.` }; } catch (error) { return { success: false as const, message: error instanceof AdsterraDailySyncError || error instanceof AdsterraApiError ? error.message : "Sync laporan harian Adsterra gagal." }; } }

export async function getAdsterraDailyHistoryAction(shopeeAccountId: number, configId: number, params: AdsterraHistoryParams) { await requireUser(); try { const data = await getAdsterraDailyHistory(prisma, shopeeAccountId, configId, parseAdsterraHistoryParams(params)); return data ? { success: true as const, data } : { success: false as const, message: "Histori campaign Adsterra tidak ditemukan." }; } catch { return { success: false as const, message: "Histori harian Adsterra gagal dimuat." }; } }

export async function analyzeAdsterraRoiAction(shopeeAccountId: number, formData: FormData) { await requireUser(); try { const upload = await readCsvUpload(shopeeAccountId, formData); const result = await buildAdsterraRoiAnalysis({ shopeeAccountId, configId: formData.get("configId"), dateFrom: formData.get("dateFrom"), dateTill: formData.get("dateTill"), fxRate: formData.get("fxRate"), ...upload }, { loadConfig: (accountId, configId) => getAdsterraConfigById(prisma, accountId, configId), getStatistics: async (input) => { const credential = await getEncryptedTrafficCredential(prisma, shopeeAccountId, TrafficProvider.ADSTERRA); if (!credential) throw new AdsterraAnalysisError("Koneksi Adsterra belum dikonfigurasi."); return getAdsterraClient(decryptTrafficSecret(credential.encryptedSecret)).getPlacementStatistics(input); } }); return { success: true as const, result }; } catch (error) { return { success: false as const, message: publicAdsterraAnalysisMessage(error) }; } }
export async function replaceAdsterraBlacklistAction(shopeeAccountId: number, formData: FormData) { await requireUser(); try { const upload = await readCsvUpload(shopeeAccountId, formData); const credential = await getEncryptedTrafficCredential(prisma, shopeeAccountId, TrafficProvider.ADSTERRA); if (!credential) throw new AdsterraAnalysisError("Koneksi Adsterra belum dikonfigurasi."); const client = getAdsterraClient(decryptTrafficSecret(credential.encryptedSecret)); const analysis = await buildAdsterraRoiAnalysis({ shopeeAccountId, configId: formData.get("configId"), dateFrom: formData.get("dateFrom"), dateTill: formData.get("dateTill"), fxRate: formData.get("fxRate"), ...upload }, { loadConfig: (accountId, configId) => getAdsterraConfigById(prisma, accountId, configId), getStatistics: (input) => client.getPlacementStatistics(input) }); const replacement = await runVerifiedBlacklistReplacement(() => replaceAdsterraBlacklist(analysis.config.campaignId, analysis.analysis.rows, client), (at) => markBlacklistReplaced(prisma, "ADSTERRA", shopeeAccountId, analysis.config.id, at)); if (replacement.status === "UPDATED") revalidatePath(`/shopee/${shopeeAccountId}/adsterra-roi`); return { success: true as const, status: replacement.status, finalCount: replacement.targetPlacementIds.length, addedCount: replacement.addedPlacementIds.length, removedCount: replacement.removedPlacementIds.length, lastBlacklistReplacedAt: replacement.lastBlacklistReplacedAt }; } catch (error) { return { success: false as const, message: error instanceof AdsterraBlacklistError ? error.message : publicAdsterraAnalysisMessage(error) }; } }
export async function saveAdsterraCredentialAction(shopeeAccountId: number, formData: FormData) { await requireUser(); try { const key = formData.get("apiKey"); if (typeof key !== "string" || !key.trim()) return { success: false as const, message: "API Key wajib diisi." }; await saveTrafficCredential(prisma, shopeeAccountId, TrafficProvider.ADSTERRA, encryptTrafficSecret(key.trim())); revalidatePath(`/shopee/${shopeeAccountId}/adsterra-roi`); return { success: true as const }; } catch { return { success: false as const, message: "Gagal menyimpan koneksi Adsterra." }; } }
export async function deleteAdsterraCredentialAction(shopeeAccountId: number) { await requireUser(); try { if (!await deleteTrafficCredential(prisma, shopeeAccountId, TrafficProvider.ADSTERRA)) return { success: false as const, message: "Koneksi Adsterra tidak ditemukan." }; revalidatePath(`/shopee/${shopeeAccountId}/adsterra-roi`); return { success: true as const }; } catch { return { success: false as const, message: "Gagal memutuskan koneksi Adsterra." }; } }
export async function saveAdsterraConfigAction(shopeeAccountId: number, formData: FormData) { await requireUser(); try { await saveAdsterraConfig(prisma, shopeeAccountId, { id: formData.get("configId") || undefined, campaignId: formData.get("campaignId"), label: formData.get("label"), sourceTag: formData.get("sourceTag") }); revalidatePath(`/shopee/${shopeeAccountId}/adsterra-roi`); return { success: true as const }; } catch (error) { return { success: false as const, message: publicAdsterraConfigMessage(error) }; } }
export async function deleteAdsterraConfigAction(shopeeAccountId: number, configId: number) { await requireUser(); try { await deleteAdsterraConfig(prisma, shopeeAccountId, configId); revalidatePath(`/shopee/${shopeeAccountId}/adsterra-roi`); return { success: true as const }; } catch (error) { return { success: false as const, message: publicAdsterraConfigMessage(error) }; } }
