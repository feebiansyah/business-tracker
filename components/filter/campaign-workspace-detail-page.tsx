import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignDailyDetail } from "@/components/filter/campaign-daily-detail";
import { campaignModeConfig, type CampaignMode } from "@/lib/filter/campaign-modes";
import { getCampaignWorkspaceDetail } from "@/lib/filter/queries";
import { parseHistoryParams } from "@/lib/filter/server-pagination";

export async function CampaignWorkspaceDetailPage({ mode, params, searchParams }: { mode: CampaignMode; params: Promise<{ id: string; campaignId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id, campaignId }, query] = await Promise.all([params, searchParams]);
  const shopeeAccountId = Number(id);
  const campaign = await getCampaignWorkspaceDetail(shopeeAccountId, mode, Number(campaignId), parseHistoryParams(query));
  if (!campaign) notFound();
  return <section className="min-w-0 space-y-6"><div className="min-w-0"><Link href={`/shopee/${shopeeAccountId}/${campaignModeConfig[mode].route}`} className="text-sm text-slate-500 hover:text-slate-900">← {campaignModeConfig[mode].title}</Link><p className="mt-3 text-sm font-medium text-slate-500">Histori Harian</p><h2 className="break-words text-2xl font-semibold tracking-tight text-slate-950">{campaign.campaign.name}</h2></div><CampaignDailyDetail mode={mode} shopeeAccountId={shopeeAccountId} detail={campaign} /></section>;
}
