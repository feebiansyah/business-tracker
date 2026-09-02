import Link from "next/link";
import { notFound } from "next/navigation";
import { ClickImportWorkflow } from "@/components/shopee-import/click-import-workflow";
import { ImportWorkflow } from "@/components/shopee-import/import-workflow";
import { getShopeeClickHistory } from "@/lib/shopee-click-import/history";
import { getShopeeImportPageData } from "@/lib/shopee-import/history";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ShopeeImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const accountId = Number(id);
  if (!Number.isSafeInteger(accountId) || accountId <= 0) notFound();
  const data = await getShopeeImportPageData(prisma, accountId);
  if (!data) notFound();
  const clickHistory = await getShopeeClickHistory(prisma, accountId);
  return <section className="space-y-6">
    <div><Link href={`/shopee/${accountId}`} className="text-sm text-slate-500 hover:text-slate-900">← {data.shopeeAccount.name}</Link><h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Import Shopee</h2><p className="mt-1 text-sm text-slate-500">Preview dan impor data Shopee tanpa menyimpan CSV mentah.</p></div>
    <div><h3 className="mb-3 text-lg font-semibold">Import Komisi</h3><ImportWorkflow shopeeAccountId={accountId} history={data.history}/></div>
    <ClickImportWorkflow shopeeAccountId={accountId} history={clickHistory}/>
  </section>;
}
