import Link from "next/link";
import { notFound } from "next/navigation";
import { FilterTable } from "@/components/filter/filter-table";
import { SyncMetaButton } from "@/components/filter/sync-meta-button";
import { getFilterPageData } from "@/lib/filter/queries";

export const dynamic = "force-dynamic";

export default async function FilterPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string | string[] }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const shopeeAccountId = Number(id);
  const search = typeof query.q === "string" ? query.q.trim().slice(0, 191) : "";
  const data = await getFilterPageData(shopeeAccountId, search);
  if (!data) notFound();
  return <section className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><Link href={`/shopee/${data.shopeeAccount.id}`} className="text-sm text-slate-500 hover:text-slate-900">← Detail Shopee</Link><p className="mt-3 text-sm font-medium text-slate-500">Campaign ACTIVE · Budget di bawah Rp200.000</p><h2 className="text-2xl font-semibold tracking-tight text-slate-950">Filter — {data.shopeeAccount.name}</h2></div><SyncMetaButton shopeeAccountId={data.shopeeAccount.id} /></div>
    {data.unresolvedBudgets > 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{data.unresolvedBudgets} campaign memiliki budget UNRESOLVED dan tidak dimasukkan ke Filter.</p>}
    <form method="get" className="flex max-w-xl gap-2"><input name="q" defaultValue={search} placeholder="Cari campaign..." className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300" /><button type="submit" className="rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700">Cari</button></form>
    <FilterTable key={search} shopeeAccountId={data.shopeeAccount.id} campaigns={data.campaigns} />
  </section>;
}
