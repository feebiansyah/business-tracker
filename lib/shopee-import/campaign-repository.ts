import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";

export type CampaignQueryDb =
  | Pick<PrismaClient, "campaign">
  | Pick<Prisma.TransactionClient, "campaign">;

export async function loadShopeeCampaignCandidates(
  db: CampaignQueryDb,
  shopeeAccountId: number,
) {
  return db.campaign.findMany({
    where: { metaAccount: { shopeeAccountId } },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });
}
