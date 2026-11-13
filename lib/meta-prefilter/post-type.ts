import "server-only";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { parsePostTypeInput, type PostTypeInput } from "@/lib/campaign-post-type/model";
import { writePostTypeOverride } from "@/lib/campaign-post-type/repository";
import { businessDate, dateValue } from "./model";

export type PrefilterPostTypeInput = PostTypeInput & { businessDate: string };
export async function savePrefilterPostType(value: PrefilterPostTypeInput, db: Pick<PrismaClient, "$transaction"> = prisma, now = new Date()) {
  const { businessDate: date, ...valueOnly } = value;
  const input = parsePostTypeInput(valueOnly);
  if (date !== businessDate(now)) throw new Error("Tanggal WIB berganti. Muat ulang PraFilter.");
  return db.$transaction(async tx => {
    const runs = await Promise.all((["AWAL", "AKHIR"] as const).map(slot => tx.metaPrefilterRun.findFirst({
      where: { shopeeAccountId: input.shopeeAccountId, businessDate: dateValue(date), slot, status: "COMPLETE" },
      orderBy: { revision: "desc" }, select: { id: true },
    })));
    const row = await tx.metaPrefilterRow.findFirst({
      where: { runId: { in: runs.flatMap(run => run ? [run.id] : []) }, metaCampaignId: input.metaCampaignId, spend: { gt: 0 } }, select: { id: true },
    });
    if (!row) throw new Error("Campaign tidak tersedia dalam snapshot akun Shopee ini.");
    return writePostTypeOverride(input, tx);
  }, { isolationLevel: "RepeatableRead", maxWait: 5_000, timeout: 10_000 });
}
