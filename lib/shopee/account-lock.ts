import type { Prisma } from "@/lib/generated/prisma/client";

// Same row lock as Shopee commission/click import. Always acquire in ID order.
export async function lockShopeeAccounts(tx: Pick<Prisma.TransactionClient, "$queryRaw">, ids: readonly number[]) {
  for (const id of [...new Set(ids)].sort((a,b)=>a-b)) {
    const rows = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM ShopeeAccount WHERE id = ${id} FOR UPDATE`;
    if (!rows.length) throw new Error("Akun Shopee yang dipilih tidak ditemukan.");
  }
}
