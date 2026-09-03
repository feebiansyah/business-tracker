import Link from "next/link";
import { notFound } from "next/navigation";
import { FilterTable } from "@/components/filter/filter-table";
import { campaignModeConfig, type CampaignMode } from "@/lib/filter/campaign-modes";
import { getCampaignWorkspaceData } from "@/lib/filter/queries";
import { filterParamsToSearch, parseFilterParams, resetFilterParams } from "@/lib/filter/server-pagination";

export async function CampaignWorkspacePage({ mode, params, searchParams }: { mode: CampaignMode; params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const shopeeAccountId = Number(id);
  const state = parseFilterParams(query);
  const data = await getCampaignWorkspaceData(shopeeAccountId, mode, state);
  if (!data) notFound();
  const config = campaignModeConfig[mode];
  return <section className="min-w-0 space-y-6">
    <div className="min-w-0"><Link href={`/shopee/${data.shopeeAccount.id}`} className="text-sm text-slate-500 hover:text-slate-900">← Detail Shopee</Link><p className="mt-3 text-sm font-medium text-slate-500">{config.description}</p><h2 className="break-words text-2xl font-semibold tracking-tight text-slate-950">{config.title} — {data.shopeeAccount.name}</h2></div>
    {data.unresolvedBudgets > 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{data.unresolvedBudgets} campaign memiliki budget UNRESOLVED dan tidak dimasukkan.</p>}
    <form method="get" className="grid min-w-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-end"><input type="hidden" name="sort" value={state.sort} /><input type="hidden" name="dir" value={state.dir} /><input type="hidden" name="pageSize" value={state.pageSize} /><label className="grid min-w-0 gap-1 text-xs font-medium text-slate-600 sm:min-w-56 sm:flex-1">Cari campaign<input name="q" defaultValue={state.q} placeholder="Cari campaign..." className="h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-slate-300" /></label><label className="grid min-w-0 gap-1 text-xs font-medium text-slate-600">Tanggal Mulai<input type="date" name="from" defaultValue={state.from} className="h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal sm:w-auto" /></label><label className="grid min-w-0 gap-1 text-xs font-medium text-slate-600">Tanggal Akhir<input type="date" name="to" defaultValue={state.to} className="h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal sm:w-auto" /></label><button type="submit" className="h-10 w-full rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700 sm:w-auto">Terapkan</button><Link href={`?${filterParamsToSearch(resetFilterParams(state))}`} className="inline-flex h-10 w-full items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:w-auto">Reset</Link></form>
    <FilterTable mode={mode} shopeeAccountId={data.shopeeAccount.id} campaigns={data.campaigns} pagination={data.pagination} state={{ ...state, page: data.pagination.page }} />
  </section>;
}
