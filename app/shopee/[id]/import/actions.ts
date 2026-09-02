"use server";
import { revalidatePath } from "next/cache";
import { Prisma } from "../../../../lib/generated/prisma/client";
import { prisma } from "../../../../lib/prisma";
import { publicImportMessage } from "../../../../lib/shopee-import/errors";
import { buildShopeeCommissionPreview } from "../../../../lib/shopee-import/preview";
import { importShopeeCommissions,validatePreviewConfirmation } from "../../../../lib/shopee-import/importer";
import { loadShopeeCampaignCandidates } from "../../../../lib/shopee-import/campaign-repository";
import { lockShopeeAccount,persistCommissionImportInTransaction } from "../../../../lib/shopee-import/persistence";
import { readCsvUpload } from "../../../../lib/shopee-import/upload";
import type { PreviewActionResult, PreviewConfirmation, PreviewDeps } from "../../../../lib/shopee-import/types";

const realPreviewDeps: PreviewDeps = {
  async accountExists(id) { return Boolean(await prisma.shopeeAccount.findUnique({ where: { id }, select: { id: true } })); },
  loadCampaigns(id) { return loadShopeeCampaignCandidates(prisma, id); },
};

export async function previewShopeeCommissionAction(shopeeAccountId:number,formData:FormData):Promise<PreviewActionResult>{try{const upload=await readCsvUpload(shopeeAccountId,formData);return {success:true,preview:await buildShopeeCommissionPreview({shopeeAccountId,...upload},realPreviewDeps)}}catch(error){return {success:false,message:publicImportMessage(error)}}}

export async function importShopeeCommissionAction(shopeeAccountId:number,confirmation:PreviewConfirmation,formData:FormData){try{validatePreviewConfirmation(confirmation);const upload=await readCsvUpload(shopeeAccountId,formData);const receipt=await importShopeeCommissions({...upload,shopeeAccountId,confirmation},{withTransaction:work=>prisma.$transaction(work,{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,timeout:30000}),lockAccount:lockShopeeAccount,loadCampaigns:loadShopeeCampaignCandidates,persist:persistCommissionImportInTransaction});revalidatePath(`/shopee/${shopeeAccountId}/import`);return {success:true as const,receipt}}catch(error){return {success:false as const,message:publicImportMessage(error)}}}
