"use server";

import { revalidatePath } from "next/cache";
import { MetaApiError } from "@/lib/meta/client";
import { syncMetaBusinessData } from "@/lib/meta/sync";
import type { MetaSyncSummary } from "@/lib/meta/types";

export type MetaSyncActionState = { success: boolean; message: string; summary?: MetaSyncSummary };

export async function syncMetaAction(): Promise<MetaSyncActionState> {
  try {
    const summary = await syncMetaBusinessData();
    revalidatePath("/wl");
    return { success: true, message: "Sinkronisasi Meta selesai.", summary };
  } catch (error) {
    const message = error instanceof MetaApiError
      ? error.message
      : error instanceof Error && error.message.startsWith("META_")
        ? error.message
        : "Sinkronisasi Meta gagal. Periksa koneksi server dan database, lalu coba lagi.";
    return { success: false, message };
  }
}
