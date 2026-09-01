"use server";

import { revalidatePath } from "next/cache";
import { FilterSyncError, syncFilter, type FilterSyncSummary } from "@/lib/filter/sync";

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
