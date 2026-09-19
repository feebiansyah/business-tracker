import Link from "next/link";
import { notFound } from "next/navigation";

import { getClickaduConfigPageData } from "@/lib/clickadu-roi/config-repository";
import { prisma } from "@/lib/prisma";
import { ClickaduAnalysisWorkflow } from "@/components/clickadu-roi/analysis-workflow";
import { ClickaduConfigForm } from "@/components/clickadu-roi/config-form";
import { ClickaduCredentialForm } from "@/components/clickadu-roi/credential-form";
import { ClickaduCampaignReportList } from "@/components/clickadu-roi/campaign-report-list";
import { indonesiaToday } from "@/lib/clickadu-history/daily-sync";

export const dynamic = "force-dynamic";

export default async function ClickaduRoiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shopeeAccountId = Number(id);
  if (!Number.isSafeInteger(shopeeAccountId) || shopeeAccountId <= 0) notFound();
  const data = await getClickaduConfigPageData(prisma, shopeeAccountId);
  if (!data) notFound();

  return (
    <section className="min-w-0 space-y-6">
      <div>
        <Link href={`/shopee/${data.account.id}`} className="text-sm text-slate-500 hover:text-slate-900">
          ← {data.account.name}
        </Link>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
          Clickadu ROI — {data.account.name}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Analisa statistik Clickadu dan CSV komisi Shopee untuk akun ini.
        </p>
      </div>
      <ClickaduCredentialForm shopeeAccountId={data.account.id} shopeeAccountName={data.account.name} connected={data.clickaduConnected} />
      <ClickaduConfigForm shopeeAccountId={data.account.id} configs={data.configs} />
      <ClickaduCampaignReportList shopeeAccountId={data.account.id} campaigns={data.configs} defaultDate={indonesiaToday()} connected={data.clickaduConnected} />
      <ClickaduAnalysisWorkflow shopeeAccountId={data.account.id} shopeeAccountName={data.account.name} configs={data.configs} connected={data.clickaduConnected} />
    </section>
  );
}
