import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { readPrefilterData } from "@/lib/meta-prefilter/service";
import { PrefilterWorkspace } from "@/components/meta-prefilter/workspace";

export const dynamic = "force-dynamic";

export default async function PrefilterPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser({ readOnly: true });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const data = await readPrefilterData(id);
  return <section className="min-w-0 space-y-4">
    <div><Link href={`/shopee/${id}`} className="text-sm text-slate-500 hover:underline">← Detail Shopee</Link><h2 className="mt-2 break-words text-2xl font-semibold">PraFilter — {data.account.name}</h2><p className="mt-1 text-sm text-slate-500">Pantau spend Meta hari berjalan. Snapshot terpisah dari histori Filter; tidak ada Sync atau OFF otomatis.</p></div>
    <PrefilterWorkspace key={`${id}-${data.businessDate}`} initial={data} />
  </section>;
}
