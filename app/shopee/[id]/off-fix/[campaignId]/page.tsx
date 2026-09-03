import { CampaignWorkspaceDetailPage } from "@/components/filter/campaign-workspace-detail-page";

export const dynamic = "force-dynamic";
export default async function OffFixCampaignDetailPage({ params, searchParams }: { params: Promise<{ id: string; campaignId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <CampaignWorkspaceDetailPage mode="off-fix" params={params} searchParams={searchParams} />;
}
