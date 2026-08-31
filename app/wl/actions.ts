"use server";

import { revalidatePath } from "next/cache";
import { MetaApiError } from "@/lib/meta/client";
import { syncMetaBusinessMappings } from "@/lib/meta/business-mapping-sync";
import { syncMetaAccounts } from "@/lib/meta/sync";
import type { MetaBusinessMappingSummary, MetaSyncSummary } from "@/lib/meta/types";

export type MetaSyncActionState = { success: boolean; message: string; summary?: MetaSyncSummary };
export type MetaBusinessMappingActionState = { success: boolean; message: string; summary?: MetaBusinessMappingSummary };

export async function syncMetaAction(): Promise<MetaSyncActionState> {
  try {
    const summary = await syncMetaAccounts();
    revalidatePath("/wl");
    return { success: true, message: "Sinkronisasi WL selesai.", summary };
  } catch (error) {
    const message = error instanceof MetaApiError
      ? error.message
      : error instanceof Error && error.message.startsWith("META_")
        ? error.message
        : "Sinkronisasi Meta gagal. Periksa koneksi server dan database, lalu coba lagi.";
    return { success: false, message };
  }
}

export async function syncMetaBusinessMappingsAction(): Promise<MetaBusinessMappingActionState> {
  try {
    const summary = await syncMetaBusinessMappings();
    revalidatePath("/wl");
    return {
      success: true,
      message: summary.completed
        ? "Mapping Business Manager selesai. Klik Sync BM lagi untuk memulai cycle baru."
        : "Batch mapping Business Manager selesai. Klik Sync BM lagi untuk melanjutkan.",
      summary,
    };
  } catch (error) {
    const message = error instanceof MetaApiError
      ? error.message
      : error instanceof Error && error.message.startsWith("META_")
        ? error.message
        : "Sinkronisasi Business Manager gagal. Periksa koneksi server dan database, lalu coba lagi.";
    return { success: false, message };
  }
}
