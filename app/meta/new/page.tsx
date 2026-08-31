import { MetaAccountForm } from "@/components/shopee/meta-account-form";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NewMetaAccountPage({ searchParams }: { searchParams: Promise<{ shopeeAccountId?: string | string[] }> }) {
  const { shopeeAccountId } = await searchParams;
  const selectedShopeeAccountId = typeof shopeeAccountId === "string" && Number.isInteger(Number(shopeeAccountId)) ? Number(shopeeAccountId) : undefined;
  const [businessManagers, shopeeAccounts] = await Promise.all([prisma.businessManager.findMany({ orderBy: { name: "asc" } }), prisma.shopeeAccount.findMany({ orderBy: { name: "asc" } })]);
  return <MetaAccountForm businessManagers={businessManagers.map((manager) => ({ id: manager.id, name: manager.name, secondary: manager.bmId }))} shopeeAccounts={shopeeAccounts.map((account) => ({ id: account.id, name: account.name, secondary: account.shopId ?? "" }))} selectedShopeeAccountId={selectedShopeeAccountId} />;
}
