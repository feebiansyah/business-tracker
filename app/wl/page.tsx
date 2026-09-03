import Link from "next/link";
import { StatusBadge } from "@/components/shopee/status-badge";
import { ConnectionStatusBadge } from "@/components/wl/connection-status-badge";
import { MetaBusinessMappingButton } from "@/components/wl/meta-business-mapping-button";
import { MetaSyncButton } from "@/components/wl/meta-sync-button";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
type ConnectionFilter = "all" | "connected" | "unconnected";

export default async function AllWlPage({ searchParams }: { searchParams: Promise<{ connection?: string | string[] }> }) {
  const { connection } = await searchParams;
  const filter: ConnectionFilter = connection === "connected" || connection === "unconnected" ? connection : "all";
  const where = filter === "connected" ? { shopeeAccountId: { not: null } } : filter === "unconnected" ? { shopeeAccountId: null } : {};
  const [metaAccounts, total, connected, unconnected] = await Promise.all([
    prisma.metaAccount.findMany({ where, include: { businessManager: true, shopeeAccount: true }, orderBy: { name: "asc" } }),
    prisma.metaAccount.count(),
    prisma.metaAccount.count({ where: { shopeeAccountId: { not: null } } }),
    prisma.metaAccount.count({ where: { shopeeAccountId: null } }),
  ]);
  const filters: { label: string; value: ConnectionFilter }[] = [{ label: "Semua", value: "all" }, { label: "Terhubung", value: "connected" }, { label: "Belum Terhubung", value: "unconnected" }];
  return (
    <section className="min-w-0 space-y-6">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="text-sm font-medium text-slate-500">Master data</p><h2 className="break-words text-2xl font-semibold tracking-tight text-slate-950">Semua WL</h2></div><div className="flex w-full flex-wrap items-start gap-3 sm:w-auto"><MetaSyncButton /><MetaBusinessMappingButton /></div></div>
      <div className="grid gap-4 sm:grid-cols-3"><SummaryCard label="Total WL" value={total} /><SummaryCard label="Terhubung Shopee" value={connected} /><SummaryCard label="Belum Terhubung" value={unconnected} /></div>
      <div className="flex flex-wrap gap-2" aria-label="Filter koneksi Shopee">{filters.map((item) => <Link key={item.value} href={item.value === "all" ? "/wl" : `/wl?connection=${item.value}`} className={`rounded-md px-3 py-2 text-sm font-medium ${filter === item.value ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>{item.label}</Link>)}</div>
      <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="max-w-full overflow-x-auto overscroll-x-contain"><table className="w-full min-w-225 text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3 font-medium sm:px-6">Nama WL</th><th className="px-3 py-3 font-medium sm:px-6">Account ID</th><th className="px-3 py-3 font-medium sm:px-6">Business Manager</th><th className="px-3 py-3 font-medium sm:px-6">Akun Shopee</th><th className="px-3 py-3 font-medium sm:px-6">Status WL</th><th className="px-3 py-3 font-medium sm:px-6">Status koneksi</th><th className="px-3 py-3 sm:px-6"><span className="sr-only">Aksi</span></th></tr></thead><tbody className="divide-y divide-slate-200">{metaAccounts.map((account) => <tr key={account.id}><td className="max-w-64 truncate px-3 py-4 font-medium text-slate-900 sm:px-6" title={account.name}>{account.name}</td><td className="px-3 py-4 text-slate-600 sm:px-6">{account.accountId}</td><td className="max-w-64 truncate px-3 py-4 text-slate-600 sm:px-6" title={account.businessManager?.name ?? "Tanpa BM"}>{account.businessManager?.name ?? "Tanpa BM"}</td><td className="max-w-64 truncate px-3 py-4 text-slate-600 sm:px-6" title={account.shopeeAccount?.name ?? "—"}>{account.shopeeAccount?.name ?? "—"}</td><td className="px-3 py-4 sm:px-6"><StatusBadge status={account.status} /></td><td className="px-3 py-4 sm:px-6"><ConnectionStatusBadge connected={account.shopeeAccountId !== null} /></td><td className="px-3 py-4 text-right sm:px-6"><Link href={`/wl/${account.id}`} className="font-medium text-slate-900 hover:underline">{account.shopeeAccountId === null ? "Hubungkan" : "Ganti akun"}</Link></td></tr>)}{metaAccounts.length === 0 && <tr><td colSpan={7} className="px-6 py-8 text-center text-slate-500">Tidak ada WL untuk filter ini.</td></tr>}</tbody></table></div></div>
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p></div>; }
