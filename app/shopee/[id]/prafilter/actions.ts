"use server";

import { revalidatePath } from "next/cache";
import { MetaApiError } from "@/lib/meta/client";
import { isValidDateInput } from "@/lib/prafilter/date";
import { PrafilterSyncError, syncPrafilter } from "@/lib/prafilter/sync";
import type { PrafilterSyncSummary } from "@/lib/prafilter/types";
import { prisma } from "@/lib/prisma";

export type PrafilterActionState = {
  success: boolean;
  message: string;
  selectedDate?: string;
  summary?: PrafilterSyncSummary;
};

export type ManualFieldActionState = { success: boolean; message: string };

export async function syncPrafilterAction(
  shopeeAccountId: number,
  _previousState: PrafilterActionState,
  formData: FormData,
): Promise<PrafilterActionState> {
  const dateValue = formData.get("date");
  const selectedDate = typeof dateValue === "string" ? dateValue : "";
  if (!isValidDateInput(selectedDate)) return { success: false, message: "Tanggal Prafilter tidak valid." };
  try {
    const summary = await syncPrafilter(shopeeAccountId, selectedDate);
    revalidatePath(`/shopee/${shopeeAccountId}/prafilter`);
    return {
      success: true,
      selectedDate,
      summary,
      message: summary.campaignsFound === 0
        ? "Sync selesai, tetapi tidak ada campaign yang mulai pada tanggal tersebut."
        : "Prafilter berhasil diperbarui.",
    };
  } catch (error) {
    const message = error instanceof MetaApiError || error instanceof PrafilterSyncError
      ? error.message
      : "Meta request gagal atau data tidak dapat disimpan. Coba kembali setelah beberapa saat.";
    return { success: false, message, selectedDate };
  }
}

async function findOwnedCampaign(shopeeAccountId: number, campaignId: number) {
  if (!Number.isInteger(shopeeAccountId) || !Number.isInteger(campaignId)) return null;
  return prisma.campaign.findFirst({
    where: { id: campaignId, metaAccount: { shopeeAccountId } },
    select: { id: true },
  });
}

function revalidatePrafilter(shopeeAccountId: number) {
  revalidatePath(`/shopee/${shopeeAccountId}/prafilter`);
}

export async function updateCampaignJenis(
  shopeeAccountId: number,
  campaignId: number,
  _previousState: ManualFieldActionState,
  formData: FormData,
): Promise<ManualFieldActionState> {
  const value = formData.get("jenis");
  const jenis = value === "GAMBAR" || value === "VIDEO" ? value : null;
  if (!(await findOwnedCampaign(shopeeAccountId, campaignId))) return { success: false, message: "Campaign tidak ditemukan." };
  await prisma.campaign.update({ where: { id: campaignId }, data: { jenis } });
  revalidatePrafilter(shopeeAccountId);
  return { success: true, message: "Jenis tersimpan." };
}

export async function updateCampaignOperationalStatus(
  shopeeAccountId: number,
  campaignId: number,
  _previousState: ManualFieldActionState,
  formData: FormData,
): Promise<ManualFieldActionState> {
  const operationalStatus = formData.get("operationalStatus") === "OFF" ? "OFF" : "ON";
  if (!(await findOwnedCampaign(shopeeAccountId, campaignId))) return { success: false, message: "Campaign tidak ditemukan." };
  await prisma.campaign.update({ where: { id: campaignId }, data: { operationalStatus } });
  revalidatePrafilter(shopeeAccountId);
  return { success: true, message: "Status tersimpan." };
}

export async function updateCampaignNote(
  shopeeAccountId: number,
  campaignId: number,
  _previousState: ManualFieldActionState,
  formData: FormData,
): Promise<ManualFieldActionState> {
  const value = formData.get("note");
  if (typeof value !== "string" || value.length > 191) return { success: false, message: "Note tidak valid atau terlalu panjang." };
  if (!(await findOwnedCampaign(shopeeAccountId, campaignId))) return { success: false, message: "Campaign tidak ditemukan." };
  await prisma.campaign.update({ where: { id: campaignId }, data: { note: value.trim() || null } });
  revalidatePrafilter(shopeeAccountId);
  return { success: true, message: "Note tersimpan." };
}
