import Link from "next/link";
import { notFound } from "next/navigation";
import { FilterTable } from "@/components/filter/filter-table";
import { SyncMetaButton } from "@/components/filter/sync-meta-button";
import { getFilterPageData } from "@/lib/filter/queries";
import { filterParamsToSearch, parseFilterParams, resetFilterParams } from "@/lib/filter/server-pagination";

export const dynamic = "force-dynamic";

export default async function FilterPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const shopeeAccountId = Number(id);
  const state = parseFilterParams(query);
  const data = await getFilterPageData(shopeeAccountId, state);
  if (!data) notFound();
  return <section className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><Link href={`/shopee/${data.shopeeAccount.id}`} className="text-sm text-slate-500 hover:text-slate-900">← Detail Shopee</Link><p className="mt-3 text-sm font-medium text-slate-500">Campaign ACTIVE · Budget di bawah Rp200.000</p><h2 className="text-2xl font-semibold tracking-tight text-slate-950">Filter — {data.shopeeAccount.name}</h2></div><SyncMetaButton shopeeAccountId={data.shopeeAccount.id} /></div>
    {data.unresolvedBudgets > 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{data.unresolvedBudgets} campaign memiliki budget UNRESOLVED dan tidak dimasukkan ke Filter.</p>}
    <form method="get" className="flex flex-wrap items-end gap-2"><input type="hidden" name="sort" value={state.sort} /><input type="hidden" name="dir" value={state.dir} /><input type="hidden" name="pageSize" value={state.pageSize} /><label className="grid min-w-56 flex-1 gap-1 text-xs font-medium text-slate-600">Cari campaign<input name="q" defaultValue={state.q} placeholder="Cari campaign..." className="h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-slate-300" /></label><label className="grid gap-1 text-xs font-medium text-slate-600">Tanggal Mulai<input type="date" name="from" defaultValue={state.from} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal" /></label><label className="grid gap-1 text-xs font-medium text-slate-600">Tanggal Akhir<input type="date" name="to" defaultValue={state.to} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal" /></label><button type="submit" className="h-10 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700">Terapkan</button><Link href={`?${filterParamsToSearch(resetFilterParams(state))}`} className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">Reset</Link></form>
    <FilterTable shopeeAccountId={data.shopeeAccount.id} campaigns={data.campaigns} pagination={data.pagination} state={{ ...state, page: data.pagination.page }} />
  </section>;
}
