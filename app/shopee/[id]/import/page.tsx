import Link from "next/link";
import { notFound } from "next/navigation";
import { getShopeeImportPageData } from "@/lib/shopee-import/history";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ShopeeImportPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;const accountId=Number(id);if(!Number.isSafeInteger(accountId)||accountId<=0)notFound();
 const data=await getShopeeImportPageData(prisma,accountId);if(!data)notFound();
 return <section className="space-y-6"><div><Link href={`/shopee/${accountId}`} className="text-sm text-slate-500 hover:text-slate-900">← {data.shopeeAccount.name}</Link><h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Import Shopee</h2></div><div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Pilih file CSV untuk memulai import komisi Shopee.</div></section>;
}
