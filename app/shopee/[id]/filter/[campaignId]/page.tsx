import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignDailyDetail } from "@/components/filter/campaign-daily-detail";
import { getFilterCampaignDetail } from "@/lib/filter/queries";
import { parseHistoryParams } from "@/lib/filter/server-pagination";

export const dynamic = "force-dynamic";
export default async function FilterCampaignDetailPage({ params, searchParams }: { params: Promise<{ id: string; campaignId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id, campaignId }, query] = await Promise.all([params, searchParams]);
  const shopeeAccountId = Number(id);
  const campaign = await getFilterCampaignDetail(shopeeAccountId, Number(campaignId), parseHistoryParams(query));
  if (!campaign) notFound();
  return <section className="space-y-6"><div><Link href={`/shopee/${shopeeAccountId}/filter`} className="text-sm text-slate-500 hover:text-slate-900">← Filter</Link><p className="mt-3 text-sm font-medium text-slate-500">Histori Harian</p><h2 className="text-2xl font-semibold tracking-tight text-slate-950">{campaign.campaign.name}</h2></div><CampaignDailyDetail shopeeAccountId={shopeeAccountId} detail={campaign} /></section>;
}
