export class ShopeeAccountManagementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShopeeAccountManagementError";
  }
}

type RenameDatabase = {
  shopeeAccount: {
    updateMany(args: { where: { id: number }; data: { name: string } }): Promise<{ count: number }>;
  };
};

type DeleteDatabase = Pick<PrismaClient, "$transaction">;

function requireShopeeAccountId(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ShopeeAccountManagementError("Akun Shopee tidak valid.");
  }
  return value;
}

export async function renameShopeeAccount(db: RenameDatabase, shopeeAccountId: number, rawName: string) {
  const id = requireShopeeAccountId(shopeeAccountId);
  const name = rawName.trim();
  if (!name) throw new ShopeeAccountManagementError("Nama Shopee wajib diisi.");

  const result = await db.shopeeAccount.updateMany({ where: { id }, data: { name } });
  if (result.count === 0) throw new ShopeeAccountManagementError("Akun Shopee tidak ditemukan.");

  return { id, name };
}

export async function deleteShopeeAccount(db: DeleteDatabase, shopeeAccountId: number, confirmationName: string) {
  const id = requireShopeeAccountId(shopeeAccountId);

  return db.$transaction(async (tx) => {
    const account = await tx.shopeeAccount.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        _count: { select: { commissionImports: true, clickImports: true } },
      },
    });
    if (!account) throw new ShopeeAccountManagementError("Akun Shopee tidak ditemukan.");
    if (confirmationName !== account.name) {
      throw new ShopeeAccountManagementError("Nama konfirmasi tidak sesuai.");
    }
    if (account._count.commissionImports > 0 || account._count.clickImports > 0) {
      throw new ShopeeAccountManagementError(
        "Akun Shopee tidak dapat dihapus karena memiliki riwayat import Komisi/Klik. Data historis tetap dipertahankan.",
      );
    }

    const detached = await tx.metaAccount.updateMany({
      where: { shopeeAccountId: id },
      data: { shopeeAccountId: null },
    });
    await tx.shopeeAccount.delete({ where: { id } });

    return { id, name: account.name, detachedMetaAccountCount: detached.count };
  });
}
import type { PrismaClient } from "@/lib/generated/prisma/client";
