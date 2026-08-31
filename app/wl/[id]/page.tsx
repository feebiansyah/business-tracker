import { notFound } from "next/navigation";
import { ShopeeConnectionForm } from "@/components/wl/shopee-connection-form";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function WlConnectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idNumber = Number(id);
  if (!Number.isInteger(idNumber)) notFound();
  const [metaAccount, shopeeAccounts] = await Promise.all([prisma.metaAccount.findUnique({ where: { id: idNumber }, select: { id: true, name: true, shopeeAccountId: true } }), prisma.shopeeAccount.findMany({ select: { id: true, name: true, shopId: true }, orderBy: { name: "asc" } })]);
  if (!metaAccount) notFound();
  return <ShopeeConnectionForm metaAccountId={metaAccount.id} metaAccountName={metaAccount.name} currentShopeeAccountId={metaAccount.shopeeAccountId} shopeeAccounts={shopeeAccounts} />;
}
