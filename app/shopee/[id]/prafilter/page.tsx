import Link from "next/link";
import { notFound } from "next/navigation";
import { PrafilterTable } from "@/components/prafilter/prafilter-table";
import { PrafilterToolbar } from "@/components/prafilter/prafilter-toolbar";
import { getTodayOperationalDate, isValidDateInput } from "@/lib/prafilter/date";
import { getPrafilterPageData } from "@/lib/prafilter/queries";

export const dynamic = "force-dynamic";

export default async function PrafilterPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ date?: string | string[] }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const shopeeAccountId = Number(id);
  if (!Number.isInteger(shopeeAccountId)) notFound();
  const dateValue = typeof query.date === "string" && isValidDateInput(query.date) ? query.date : getTodayOperationalDate();
  const data = await getPrafilterPageData(shopeeAccountId, dateValue);
  if (!data) notFound();

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><Link href={`/shopee/${shopeeAccountId}`} className="text-sm text-slate-500 hover:text-slate-900">← Akun Shopee</Link><p className="mt-3 text-sm font-medium text-slate-500">Review campaign baru</p><h2 className="text-2xl font-semibold tracking-tight text-slate-950">Prafilter — {data.shopeeAccount.name}</h2></div>
        <PrafilterToolbar shopeeAccountId={shopeeAccountId} selectedDate={dateValue} disabled={data.summary.metaAccounts === 0} />
      </div>
      {data.summary.metaAccounts === 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Tidak ada WL yang terhubung ke akun Shopee ini. Hubungkan WL terlebih dahulu; Meta tidak akan dipanggil.</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><SummaryCard label="Campaign" value={data.summary.campaigns} /><SummaryCard label="WL" value={data.summary.metaAccounts} /><SummaryCard label="ON" value={data.summary.on} /><SummaryCard label="OFF" value={data.summary.off} /></div>
      <PrafilterTable shopeeAccountId={shopeeAccountId} rows={data.rows} />
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p></div>;
}
