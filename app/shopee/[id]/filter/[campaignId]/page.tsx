import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignDailyDetail } from "@/components/filter/campaign-daily-detail";
import { getFilterCampaignDetail } from "@/lib/filter/queries";

export const dynamic = "force-dynamic";
export default async function FilterCampaignDetailPage({ params }: { params: Promise<{ id: string; campaignId: string }> }) {
  const { id, campaignId } = await params;
  const shopeeAccountId = Number(id);
  const campaign = await getFilterCampaignDetail(shopeeAccountId, Number(campaignId));
  if (!campaign) notFound();
  return <section className="space-y-6"><div><Link href={`/shopee/${shopeeAccountId}/filter`} className="text-sm text-slate-500 hover:text-slate-900">← Filter</Link><p className="mt-3 text-sm font-medium text-slate-500">Histori Harian</p><h2 className="text-2xl font-semibold tracking-tight text-slate-950">{campaign.campaign.name}</h2></div><CampaignDailyDetail shopeeAccountId={shopeeAccountId} detail={campaign} /></section>;
}
