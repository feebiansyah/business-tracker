import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAdsterraConfigPageData } from "@/lib/adsterra-roi/config-repository";
import { AdsterraCredentialForm } from "@/components/adsterra-roi/credential-form";
import { AdsterraConfigForm } from "@/components/adsterra-roi/config-form";
import { AdsterraAnalysisWorkflow } from "@/components/adsterra-roi/analysis-workflow";
import { AdsterraCampaignReportList } from "@/components/adsterra-roi/campaign-report-list";
import { AdsterraWorkspaceTabs } from "@/components/adsterra-roi/adsterra-workspace-tabs";

export const dynamic = "force-dynamic";

export default async function AdsterraRoiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const accountId = Number(id);
  if (!Number.isSafeInteger(accountId) || accountId <= 0) notFound();
  const data = await getAdsterraConfigPageData(prisma, accountId);
  if (!data) notFound();
  return <section className="min-w-0 space-y-6">
    <div><Link href={`/shopee/${data.account.id}`} className="text-sm text-slate-500 hover:text-slate-900">← {data.account.name}</Link><h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Adsterra ROI — {data.account.name}</h2><p className="mt-1 text-sm text-slate-500">Analisa statistik placement Adsterra dan CSV komisi Shopee untuk akun ini.</p></div>
    <AdsterraWorkspaceTabs
      campaign={<AdsterraCampaignReportList shopeeAccountId={data.account.id} campaigns={data.configs} connected={data.connected}/>}
      placement={<AdsterraAnalysisWorkflow shopeeAccountId={data.account.id} shopeeAccountName={data.account.name} configs={data.configs} connected={data.connected}/>}
      settings={<div className="space-y-6">
        <AdsterraCredentialForm shopeeAccountId={data.account.id} shopeeAccountName={data.account.name} connected={data.connected}/>
        <AdsterraConfigForm shopeeAccountId={data.account.id} configs={data.configs}/>
      </div>}
    />
  </section>;
}
