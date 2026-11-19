import "server-only";
import { prisma } from "@/lib/prisma";
import { reviewBusinessDate, type CampaignReviewResult, type CampaignReviewState } from "./campaign-review-state";

type ReviewUser = { id: number; role?: string };

export async function recordCampaignReview(user: ReviewUser, campaignId: number, now = new Date()): Promise<CampaignReviewResult> {
  if (user.role !== "REVIEWER") return { status: "NOT_APPLICABLE" };
  const businessDate = reviewBusinessDate(now);
  const key = { userId: user.id, campaignId, businessDate: new Date(`${businessDate}T00:00:00.000Z`) };
  try {
    try {
      await prisma.campaignDailyReview.upsert({
        where: { userId_campaignId_businessDate: key },
        create: { ...key, reviewedAt: now },
        update: {},
      });
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "P2002")) throw error;
      const existing = await prisma.campaignDailyReview.findUnique({ where: { userId_campaignId_businessDate: key } });
      if (!existing) throw error;
    }
    return { status: "RECORDED", mark: { userId: user.id, campaignId, businessDate } };
  } catch {
    return { status: "FAILED", message: "Histori berhasil dimuat, tetapi tanda review belum tersimpan." };
  }
}

export async function readCampaignReviewsForToday(user: ReviewUser, campaignIds: number[], now = new Date()): Promise<CampaignReviewState | null> {
  if (user.role !== "REVIEWER") return null;
  const businessDate = reviewBusinessDate(now);
  const rows = campaignIds.length ? await prisma.campaignDailyReview.findMany({
    where: { userId: user.id, campaignId: { in: campaignIds }, businessDate: new Date(`${businessDate}T00:00:00.000Z`) },
    select: { campaignId: true },
  }) : [];
  return { userId: user.id, businessDate, campaignIds: rows.map(row => row.campaignId) };
}
