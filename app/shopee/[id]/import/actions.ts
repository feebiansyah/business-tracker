"use server";

import { loadShopeeCampaignCandidates } from "@/lib/shopee-import/campaign-repository";
import { publicImportMessage } from "@/lib/shopee-import/errors";
import { buildShopeeCommissionPreview } from "@/lib/shopee-import/preview";
import { readCsvUpload } from "@/lib/shopee-import/upload";
import type { PreviewActionResult, PreviewDeps } from "@/lib/shopee-import/types";
import { prisma } from "@/lib/prisma";

const realPreviewDeps: PreviewDeps = {
  async accountExists(shopeeAccountId) {
    return Boolean(
      await prisma.shopeeAccount.findUnique({
        where: { id: shopeeAccountId },
        select: { id: true },
      }),
    );
  },
  loadCampaigns(shopeeAccountId) {
    return loadShopeeCampaignCandidates(prisma, shopeeAccountId);
  },
};

export async function previewShopeeCommissionAction(
  shopeeAccountId: number,
  formData: FormData,
): Promise<PreviewActionResult> {
  try {
    const upload = await readCsvUpload(shopeeAccountId, formData);
    const preview = await buildShopeeCommissionPreview(
      { shopeeAccountId, ...upload },
      realPreviewDeps,
    );
    return { success: true, preview };
  } catch (error) {
    return { success: false, message: publicImportMessage(error) };
  }
}
