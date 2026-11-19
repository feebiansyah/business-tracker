import { Prisma, type PrismaClient } from "../generated/prisma/client";

type Database = Pick<PrismaClient, "$transaction">;
export class OverviewGroupError extends Error {}
function validId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
export async function saveOverviewGroup(db: Database, input: { id?: unknown; name: unknown; memberIds: unknown }) {
  if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 191) throw new OverviewGroupError("Nama grup wajib diisi, maksimal 191 karakter.");
  if (input.id !== undefined && !validId(input.id)) throw new OverviewGroupError("Grup tidak valid.");
  if (!Array.isArray(input.memberIds) || !input.memberIds.every(validId)) throw new OverviewGroupError("Pilihan akun tidak valid.");
  const ids = [...new Set<number>(input.memberIds)].sort((a, b) => a - b);
  if (ids.length < 2) throw new OverviewGroupError("Pilih minimal dua akun Shopee.");
  const name = input.name.trim(), id = input.id;
  try {
    return await db.$transaction(async (tx) => {
      if (id !== undefined) {
        const groups = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM ShopeeOverviewGroup WHERE id = ${id} FOR UPDATE`;
        if (!groups.length) throw new OverviewGroupError("Grup tidak ditemukan.");
      }
      // Same account-row lock order as import; membership uniqueness also guards concurrent creations.
      const accounts = await tx.$queryRaw<{ id: number }[]>(Prisma.sql`SELECT id FROM ShopeeAccount WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);
      if (accounts.length !== ids.length) throw new OverviewGroupError("Akun Shopee tidak ditemukan.");
      const occupied = await tx.shopeeOverviewGroupMember.findMany({ where: { shopeeAccountId: { in: ids } }, select: { groupId: true, shopeeAccountId: true } });
      if (occupied.some((member) => member.groupId !== id)) throw new OverviewGroupError("Akun sudah menjadi anggota grup lain. Lepaskan dari grup tersebut terlebih dahulu.");
      const group = id === undefined
        ? await tx.shopeeOverviewGroup.create({ data: { name } })
        : await tx.shopeeOverviewGroup.update({ where: { id }, data: { name } });
      await tx.shopeeOverviewGroupMember.deleteMany({ where: { groupId: group.id } });
      await tx.shopeeOverviewGroupMember.createMany({ data: ids.map((shopeeAccountId) => ({ groupId: group.id, shopeeAccountId })) });
      return group.id;
    });
  } catch (error) {
    if (error instanceof OverviewGroupError) throw error;
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new OverviewGroupError("Akun sudah menjadi anggota grup lain. Muat ulang pilihan akun.");
    throw new OverviewGroupError("Grup belum dapat disimpan. Muat ulang untuk memeriksa hasil sebelum mencoba lagi.");
  }
}

export async function deleteOverviewGroup(db: Database, id: unknown) {
  if (!validId(id)) throw new OverviewGroupError("Grup tidak valid.");
  await db.$transaction(async (tx) => {
    const groups = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM ShopeeOverviewGroup WHERE id = ${id} FOR UPDATE`;
    if (groups.length) await tx.shopeeOverviewGroup.delete({ where: { id } });
  });
}
