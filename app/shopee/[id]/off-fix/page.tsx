import { CampaignWorkspacePage } from "@/components/filter/campaign-workspace-page";

export const dynamic = "force-dynamic";

export default async function OffFixPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <CampaignWorkspacePage mode="off-fix" params={params} searchParams={searchParams} />;
}
