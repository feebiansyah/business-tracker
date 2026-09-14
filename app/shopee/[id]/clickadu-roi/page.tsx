import Link from "next/link";
import { notFound } from "next/navigation";

import { getClickaduConfigPageData } from "@/lib/clickadu-roi/config-repository";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ClickaduRoiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shopeeAccountId = Number(id);
  if (!Number.isSafeInteger(shopeeAccountId) || shopeeAccountId <= 0) notFound();
  const data = await getClickaduConfigPageData(prisma, shopeeAccountId);
  if (!data) notFound();

  return (
    <section className="min-w-0 space-y-6">
      <div>
        <Link href={`/shopee/${data.account.id}`} className="text-sm text-slate-500 hover:text-slate-900">
          ← {data.account.name}
        </Link>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Clickadu ROI</h2>
        <p className="mt-1 text-sm text-slate-500">Konfigurasi campaign Clickadu untuk sumber Shopee account ini.</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-slate-900">{data.configs.length} campaign terkonfigurasi</p>
        <p className="mt-1 text-sm text-slate-500">Form konfigurasi dan analisis ROI akan tersedia pada tahap berikutnya.</p>
      </div>
    </section>
  );
}
