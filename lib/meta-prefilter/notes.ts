import "server-only";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { businessDate, dateValue, metaId } from "./model";
import type { PrefilterNote } from "./types";

type NoteDb = Pick<PrismaClient, "$transaction">;
export type NoteInput = { shopeeAccountId: number; businessDate: string; metaCampaignId: string; note: string; completed: boolean };

export async function savePrefilterNote(input: NoteInput, db: NoteDb = prisma, now = new Date()): Promise<PrefilterNote> {
  if (!Number.isSafeInteger(input.shopeeAccountId) || input.shopeeAccountId <= 0 || input.businessDate !== businessDate(now) || typeof input.note !== "string" || input.note.length > 2000 || typeof input.completed !== "boolean") {
    throw new Error("Note tidak valid atau tanggal WIB sudah berganti. Muat ulang PraFilter.");
  }
  const metaCampaignId = metaId(input.metaCampaignId), date = dateValue(input.businessDate);
  return db.$transaction(async tx => {
    const account = await tx.shopeeAccount.findUnique({where:{id:input.shopeeAccountId},select:{id:true}});
    if (!account) throw new Error("Akun Shopee tidak ditemukan.");
    // Validate membership in published snapshots, not a replaceable row ID or a permanent Campaign.
    const runs = await Promise.all((["AWAL", "AKHIR"] as const).map(slot => tx.metaPrefilterRun.findFirst({where:{shopeeAccountId:input.shopeeAccountId,businessDate:date,slot,status:"COMPLETE"},orderBy:{revision:"desc"},select:{id:true}})));
    const row = await tx.metaPrefilterRow.findFirst({where:{runId:{in:runs.flatMap(r=>r?[r.id]:[])},metaCampaignId,spend:{gt:0}},select:{id:true}});
    if (!row) throw new Error("Campaign tidak tersedia pada snapshot akun ini. Muat ulang PraFilter.");
    const key = {shopeeAccountId:input.shopeeAccountId,businessDate:date,metaCampaignId};
    const value = {note:input.note.trim(),completed:input.completed};
    return tx.metaPrefilterNote.upsert({where:{shopeeAccountId_businessDate_metaCampaignId:key},create:{...key,...value},update:value,select:{metaCampaignId:true,note:true,completed:true}});
  }, {isolationLevel:"RepeatableRead",maxWait:5_000,timeout:10_000});
}
