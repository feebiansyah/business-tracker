"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../../../../lib/auth/session";
import { prisma } from "../../../../lib/prisma";
import { publicClickaduConfigMessage } from "../../../../lib/clickadu-roi/config-input";
import {
  deleteClickaduConfig,
  getClickaduConfigPageData,
  saveClickaduConfig,
} from "../../../../lib/clickadu-roi/config-repository";

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
