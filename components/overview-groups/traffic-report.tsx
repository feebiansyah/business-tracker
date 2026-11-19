import Link from "next/link";
import type { GroupTrafficData } from "@/lib/overview-groups/traffic";
import { formatRupiah } from "@/lib/filter/table-utils";

export function GroupTrafficReport({ reports,accounts,search }: { reports: GroupTrafficData; accounts: {id:number;name:string}[]; search: string }) {
  const names = new Map(accounts.map((a) => [a.id,a.name]));
  const value = (n: string | null) => n === null ? "—" : formatRupiah(Number(n));
  return <div className="min-w-0 space-y-4">{reports.map((report) => {
    const sortHref = (sort: string) => { const p = new URLSearchParams(search);p.set(`${report.key}Sort`,sort);p.set(`${report.key}Dir`,report.state.sort === sort && report.state.dir === "asc" ? "desc" : "asc");p.set(`${report.key}Page`,"1");return `?${p}`; };
    const href = (page: number) => { const p = new URLSearchParams(search); p.set(`${report.key}Page`,String(page)); return `?${p}`; };
    return <section key={report.provider} className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <h3 className="p-3 font-semibold">{report.provider} · Laporan per akun</h3>
      <p className="px-3 pb-2 text-xs text-slate-500">Hanya data tersimpan; akun dan campaign tidak dideduplikasi lintas anggota. Ringkasan hanya tanggal lengkap; nilai hilang tetap —. Konversi mengikuti rumus existing.</p>
      {report.summary.length === 0 ? <p className="p-3 text-sm text-slate-600">Belum ada campaign</p> : <ul className="space-y-1 px-3 pb-3 text-xs text-slate-700">{report.summary.map((s) => <li key={s.shopeeAccountId} className="break-words">{names.get(s.shopeeAccountId)} · {s.unsynced ? `${s.unsynced} campaign belum pernah Sync${s.earliest ? ` · lainnya data sampai ${s.earliest}` : ""}` : `Data seluruh campaign sampai ${s.earliest}`} · Spend {value(s.spendIdr)} · Komisi {value(s.commissionIdr)} · Profit {value(s.profitIdr)}{s.incompleteDays > 0 && ` · ${s.incompleteDays} tanggal belum lengkap`}</li>)}</ul>}
      <div className="max-w-full overflow-x-auto"><table className="w-full min-w-175 text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>{[["Akun Shopee",null],["Tanggal","date"],["Spend USD","spendUsd"],["Spend IDR","spendIdr"],["Komisi","commission"],["Profit","profit"],["% Profit","profitPercent"]].map(([label,key]) => <th key={label} className="px-3 py-2 font-medium">{key ? <Link href={sortHref(key)}>{label}{report.state.sort === key ? report.state.dir === "asc" ? " ↑" : " ↓" : ""}</Link> : label}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-200">{report.rows.map((r) => <tr key={`${r.shopeeAccountId}:${r.date}`}><td className="max-w-56 break-words px-3 py-2">{names.get(r.shopeeAccountId)}</td><td className="whitespace-nowrap px-3 py-2">{r.date}</td><td className="px-3 py-2">{r.spendUsd === null ? "—" : `$${r.spendUsd}`}</td><td className="whitespace-nowrap px-3 py-2">{value(r.spendIdr)}</td><td className="whitespace-nowrap px-3 py-2">{value(r.commissionIdr)}</td><td className="whitespace-nowrap px-3 py-2">{value(r.profitIdr)}</td><td className="px-3 py-2">{r.profitPercent === null ? "—" : `${Number(r.profitPercent).toFixed(2)}%`}</td></tr>)}
        {report.rows.length === 0 && <tr><td colSpan={7} className="p-3 text-slate-500">Belum ada histori dalam rentang tanggal ini.</td></tr>}</tbody></table></div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 p-3 text-xs"><span>{report.total} baris · Halaman {report.page} dari {report.pageCount}</span><div className="flex gap-3">{report.page > 1 && <Link href={href(report.page-1)}>Sebelumnya</Link>}{report.page < report.pageCount && <Link href={href(report.page+1)}>Berikutnya</Link>}</div></footer>
    </section>;
  })}</div>;
}
