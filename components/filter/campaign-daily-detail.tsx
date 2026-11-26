import type { ReactNode } from "react";
import { CampaignDailyTable } from "@/components/filter/campaign-daily-table";
import type { FilterCampaignDetail } from "@/lib/filter/queries";
import type { HistoryParams } from "@/lib/filter/server-pagination";
import type { CampaignMode } from "@/lib/filter/campaign-modes";
import { formatRupiah } from "@/lib/filter/table-utils";

export function CampaignDailyDetail({ mode, shopeeAccountId, detail, compact = false, onStateChange, metaSettings }: { mode: CampaignMode; shopeeAccountId: number; detail: FilterCampaignDetail; compact?: boolean; onStateChange?: (state: HistoryParams) => void; metaSettings?: ReactNode }) {
  const header = [["WL", detail.campaign.wlName], ["Budget", formatRupiah(detail.campaign.budget)], ["Status", detail.campaign.status], ["Tanggal Mulai Tayang", detail.campaign.startDate ?? "—"], ["Total Spend", formatRupiah(detail.campaign.totalSpend)]];
  const summary = <dl className={`grid min-w-0 ${compact ? "shrink-0 grid-cols-2 gap-2 pb-2 text-[10px] sm:grid-cols-5" : "gap-2 sm:grid-cols-2 lg:grid-cols-5"}`}>{header.map(([label, value]) => <div key={label} className={`min-w-0 rounded-lg border border-slate-200 ${compact ? "bg-slate-50 p-2" : "bg-white p-4"}`}><dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 break-words font-semibold text-slate-950">{value}</dd></div>)}</dl>;
  return <div className={`${compact ? "flex min-h-0 flex-1 flex-col" : "space-y-6"} min-w-0`}>
    {summary}
    {metaSettings}
    <CampaignDailyTable key={`${detail.state.sort}-${detail.state.dir}-${detail.state.page}-${detail.state.pageSize}`} mode={mode} shopeeAccountId={shopeeAccountId} campaignId={detail.campaign.id} rows={detail.dailyMetrics} pagination={detail.pagination} state={detail.state} compact={compact} onStateChange={onStateChange} />
  </div>;
}
