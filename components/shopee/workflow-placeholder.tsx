import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

type ShopeeWorkflow = "Filter" | "Fix" | "OFF Filter" | "OFF Fix";

export async function ShopeeWorkflowPlaceholder({
  params,
  workflow,
}: {
  params: Promise<{ id: string }>;
  workflow: ShopeeWorkflow;
}) {
  const { id } = await params;
  const shopeeAccountId = Number(id);
  if (!Number.isInteger(shopeeAccountId) || shopeeAccountId <= 0) notFound();

  const account = await prisma.shopeeAccount.findUnique({
    where: { id: shopeeAccountId },
    select: { id: true, name: true },
  });
  if (!account) notFound();

  return (
    <section className="space-y-6">
      <div>
        <Link href={`/shopee/${account.id}`} className="text-sm text-slate-500 hover:text-slate-900">← Detail Shopee</Link>
        <p className="mt-3 text-sm font-medium text-slate-500">Akun Shopee</p>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{workflow} — {account.name}</h2>
      </div>
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-600">
        Fitur {workflow} akan dibangun pada tahap berikutnya.
      </div>
    </section>
  );
}
