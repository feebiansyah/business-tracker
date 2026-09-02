import { CampaignDailyTable } from "@/components/filter/campaign-daily-table";
import type { FilterCampaignDetail } from "@/lib/filter/queries";
import { formatRupiah } from "@/lib/filter/table-utils";

export function CampaignDailyDetail({ shopeeAccountId, detail, compact = false }: { shopeeAccountId: number; detail: FilterCampaignDetail; compact?: boolean }) {
  const header = [["WL", detail.campaign.wlName], ["Budget", formatRupiah(detail.campaign.budget)], ["Status", detail.campaign.status], ["Start date", detail.campaign.startDate ?? "—"], ["Total Spend", formatRupiah(detail.campaign.totalSpend)]];
  return <div className={compact ? "space-y-3" : "space-y-6"}>
    <dl className={`grid gap-2 sm:grid-cols-2 lg:grid-cols-5 ${compact ? "text-xs" : ""}`}>{header.map(([label, value]) => <div key={label} className={`rounded-lg border border-slate-200 bg-white ${compact ? "p-2" : "p-4"}`}><dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 font-semibold text-slate-950">{value}</dd></div>)}</dl>
    <CampaignDailyTable shopeeAccountId={shopeeAccountId} campaignId={detail.campaign.id} rows={detail.dailyMetrics} compact={compact}/>
  </div>;
}
