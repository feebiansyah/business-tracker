import type { Prisma } from "@/lib/generated/prisma/client";

type SnapshotDb = Pick<Prisma.TransactionClient, "campaignDailyBudgetSnapshot">;

export async function upsertCampaignDailyBudgetSnapshot(db: SnapshotDb, campaignId: number, date: string, dailyBudget: number) {
  const snapshotDate = new Date(`${date}T00:00:00.000Z`);
  return db.campaignDailyBudgetSnapshot.upsert({
    where: { campaignId_date: { campaignId, date: snapshotDate } },
    create: { campaignId, date: snapshotDate, dailyBudget },
    update: { dailyBudget },
  });
}
