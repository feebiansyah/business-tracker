export type CampaignReviewMark = { userId: number; campaignId: number; businessDate: string };
export type CampaignReviewState = { userId: number; businessDate: string; campaignIds: number[] };
export type CampaignReviewResult = { status: "RECORDED"; mark: CampaignReviewMark } | { status: "FAILED"; message: string } | { status: "NOT_APPLICABLE" };

const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" });
export function reviewBusinessDate(now = new Date()) { return formatter.format(now); }

export function isCampaignReviewedToday(state: CampaignReviewState | null | undefined, marks: CampaignReviewMark[], campaignId: number, now = new Date()) {
  if (!state) return false;
  const today = reviewBusinessDate(now);
  return (state.businessDate === today && state.campaignIds.includes(campaignId))
    || marks.some(mark => mark.userId === state.userId && mark.campaignId === campaignId && mark.businessDate === today);
}
