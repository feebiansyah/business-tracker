"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { saveCampaignPostType } from "@/lib/campaign-post-type/repository";
import type { PostTypeInput, PostTypeResult } from "@/lib/campaign-post-type/model";

export async function saveCampaignPostTypeAction(input: PostTypeInput): Promise<PostTypeResult> {
  await requireUser({ readOnly: true });
  try {
    const saved = await saveCampaignPostType(input);
    for (const mode of ["filter", "fix", "off-filter", "off-fix"]) revalidatePath(`/shopee/${input.shopeeAccountId}/${mode}`);
    revalidatePath(`/shopee/${input.shopeeAccountId}/prefilter`);
    return { success: true, ...saved };
  } catch {
    return { success: false, message: "Jenis belum tersimpan. Muat ulang dan coba lagi." };
  }
}
