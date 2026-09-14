"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../../../../lib/auth/session";
import { prisma } from "../../../../lib/prisma";
import { publicClickaduConfigMessage } from "../../../../lib/clickadu-roi/config-input";
import { buildClickaduRoiAnalysis, ClickaduAnalysisError, publicClickaduAnalysisMessage } from "../../../../lib/clickadu-roi/analyze";
import { getClickaduClient } from "../../../../lib/clickadu-roi/config";
import { readCsvUpload } from "../../../../lib/shopee-import/upload";
import { TrafficProvider } from "../../../../lib/generated/prisma/client";
import { decryptTrafficSecret, encryptTrafficSecret } from "../../../../lib/traffic-credentials/crypto";
import { deleteTrafficCredential, getEncryptedTrafficCredential, saveTrafficCredential } from "../../../../lib/traffic-credentials/repository";
import {
  deleteClickaduConfig,
  getClickaduConfigById,
  getClickaduConfigPageData,
  saveClickaduConfig,
} from "../../../../lib/clickadu-roi/config-repository";

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
