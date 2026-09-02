import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/shopee/status-badge";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ShopeeAccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shopeeAccountId = Number(id);
  if (!Number.isInteger(shopeeAccountId)) notFound();
  const account = await prisma.shopeeAccount.findUnique({
    where: { id: shopeeAccountId },
    include: { metaAccounts: { include: { businessManager: true }, orderBy: { name: "asc" } } },
  });
  if (!account) notFound();

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><Link href="/shopee" className="text-sm text-slate-500 hover:text-slate-900">← Akun Shopee</Link><div className="mt-3 flex items-center gap-3"><h2 className="text-2xl font-semibold tracking-tight text-slate-950">{account.name}</h2><StatusBadge status={account.status} /></div></div>
        <div className="flex gap-2"><Button variant="ghost" asChild><Link href={`/shopee/${account.id}/import`}>Import Shopee</Link></Button><Button asChild><Link href={`/meta/new?shopeeAccountId=${account.id}`}>Tambah WL</Link></Button></div>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-6 py-3 font-medium">Nama WL</th><th className="px-6 py-3 font-medium">Account ID</th><th className="px-6 py-3 font-medium">Business Manager</th><th className="px-6 py-3 font-medium">Status</th></tr></thead><tbody className="divide-y divide-slate-200">{account.metaAccounts.map((metaAccount) => <tr key={metaAccount.id}><td className="px-6 py-4 font-medium text-slate-900">{metaAccount.name}</td><td className="px-6 py-4 text-slate-600">{metaAccount.accountId}</td><td className="px-6 py-4 text-slate-600">{metaAccount.businessManager?.name ?? "Tanpa BM"}</td><td className="px-6 py-4"><StatusBadge status={metaAccount.status} /></td></tr>)}{account.metaAccounts.length === 0 && <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">Belum ada WL pada akun ini.</td></tr>}</tbody></table>
      </div>
    </section>
  );
}
