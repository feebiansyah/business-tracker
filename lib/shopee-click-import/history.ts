import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import type { ClickHistoryRow } from "./types.ts";

type Db = Pick<PrismaClient, "shopeeClickImport"> | Pick<Prisma.TransactionClient, "shopeeClickImport">;
const day = (value: Date) => value.toISOString().slice(0, 10);

export async function getShopeeClickHistory(db: Db, shopeeAccountId: number): Promise<ClickHistoryRow[]> {
  const rows = await db.shopeeClickImport.findMany({ where: { shopeeAccountId }, take: 50, orderBy: { createdAt: "desc" } });
  return rows.map((row) => ({ ...row, dateFrom: day(row.dateFrom), dateTo: day(row.dateTo), createdAt: row.createdAt.toISOString() }));
}
