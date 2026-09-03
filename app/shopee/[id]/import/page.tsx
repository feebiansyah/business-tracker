import Link from "next/link";
import { notFound } from "next/navigation";
import { ClickImportWorkflow } from "@/components/shopee-import/click-import-workflow";
import { ImportWorkflow } from "@/components/shopee-import/import-workflow";
import { getShopeeClickHistory } from "@/lib/shopee-click-import/history";
import { getShopeeImportPageData } from "@/lib/shopee-import/history";
import { parseImportHistoryParams } from "@/lib/shopee-import/history-pagination";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ShopeeImportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const accountId = Number(id);
  if (!Number.isSafeInteger(accountId) || accountId <= 0) notFound();
  const historyState = parseImportHistoryParams(query);
  const data = await getShopeeImportPageData(prisma, accountId, historyState.commissionPage, historyState.commissionPageSize);
  if (!data) notFound();
  const clickHistory = await getShopeeClickHistory(prisma, accountId, historyState.clickPage, historyState.clickPageSize);
  return <section className="min-w-0 space-y-6">
    <div><Link href={`/shopee/${accountId}`} className="text-sm text-slate-500 hover:text-slate-900">← {data.shopeeAccount.name}</Link><h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Import Shopee</h2><p className="mt-1 text-sm text-slate-500">Preview dan impor data Shopee tanpa menyimpan CSV mentah.</p></div>
    <div><h3 className="mb-3 text-lg font-semibold">Import Komisi</h3><ImportWorkflow shopeeAccountId={accountId} history={data.history} historyPagination={data.pagination} historyState={historyState}/></div>
    <ClickImportWorkflow shopeeAccountId={accountId} history={clickHistory.rows} historyPagination={clickHistory.pagination} historyState={historyState}/>
  </section>;
}
