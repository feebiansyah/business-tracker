import Link from "next/link";
import { notFound } from "next/navigation";
import { getShopeeImportPageData } from "@/lib/shopee-import/history";
import { prisma } from "@/lib/prisma";
import { ImportWorkflow } from "@/components/shopee-import/import-workflow";

export const dynamic = "force-dynamic";

export default async function ShopeeImportPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;const accountId=Number(id);if(!Number.isSafeInteger(accountId)||accountId<=0)notFound();
 const data=await getShopeeImportPageData(prisma,accountId);if(!data)notFound();
 return <section className="space-y-6"><div><Link href={`/shopee/${accountId}`} className="text-sm text-slate-500 hover:text-slate-900">← {data.shopeeAccount.name}</Link><h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Import Shopee</h2><p className="mt-1 text-sm text-slate-500">Preview dan impor komisi affiliate berdasarkan Tag_link2.</p></div><ImportWorkflow shopeeAccountId={accountId} history={data.history}/></section>;
}
