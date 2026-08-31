import Link from "next/link";
import { StatusBadge } from "@/components/shopee/status-badge";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ShopeePage() {
  const shopeeAccounts = await prisma.shopeeAccount.findMany({ include: { _count: { select: { metaAccounts: true } } }, orderBy: { name: "asc" } });
  return <section className="space-y-6"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium text-slate-500">Master data</p><h2 className="text-2xl font-semibold tracking-tight text-slate-950">Akun Shopee</h2></div><Button asChild><Link href="/shopee/new">Tambah Akun</Link></Button></div>{shopeeAccounts.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Belum ada Akun Shopee. Tambahkan akun pertama untuk mulai mengelola WL.</div> : <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-6 py-3 font-medium">Nama Akun</th><th className="px-6 py-3 font-medium">Jumlah WL</th><th className="px-6 py-3 font-medium">Status</th><th className="px-6 py-3"><span className="sr-only">Detail</span></th></tr></thead><tbody className="divide-y divide-slate-200">{shopeeAccounts.map((account) => <tr key={account.id}><td className="px-6 py-4 font-medium text-slate-900">{account.name}</td><td className="px-6 py-4 text-slate-600">{account._count.metaAccounts}</td><td className="px-6 py-4"><StatusBadge status={account.status} /></td><td className="px-6 py-4 text-right"><Link href={`/shopee/${account.id}`} className="font-medium text-slate-900 hover:underline">Lihat detail</Link></td></tr>)}</tbody></table></div>}</section>;
}
