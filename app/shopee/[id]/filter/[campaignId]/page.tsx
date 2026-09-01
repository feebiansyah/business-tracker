import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignDailyTable } from "@/components/filter/campaign-daily-table";
import { getFilterCampaignDetail } from "@/lib/filter/queries";
import { formatRupiah } from "@/lib/filter/table-utils";

export const dynamic = "force-dynamic";
export default async function FilterCampaignDetailPage({ params }: { params: Promise<{ id: string; campaignId: string }> }) {
  const { id, campaignId } = await params;
  const shopeeAccountId = Number(id);
  const campaign = await getFilterCampaignDetail(shopeeAccountId, Number(campaignId));
  if (!campaign) notFound();
  const header = [
    ["WL", campaign.campaign.wlName], ["Budget", formatRupiah(campaign.campaign.budget)], ["Status", campaign.campaign.status],
    ["Start date", campaign.campaign.startDate ?? "—"], ["Total Spend", formatRupiah(campaign.campaign.totalSpend)],
  ];
  return <section className="space-y-6"><div><Link href={`/shopee/${shopeeAccountId}/filter`} className="text-sm text-slate-500 hover:text-slate-900">← Filter</Link><p className="mt-3 text-sm font-medium text-slate-500">Histori Harian</p><h2 className="text-2xl font-semibold tracking-tight text-slate-950">{campaign.campaign.name}</h2></div><dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{header.map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4"><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 font-semibold text-slate-950">{value}</dd></div>)}</dl><CampaignDailyTable shopeeAccountId={shopeeAccountId} campaignId={campaign.campaign.id} rows={campaign.dailyMetrics} /></section>;
}
