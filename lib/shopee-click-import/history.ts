import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import type { ClickHistoryRow } from "./types.ts";
import { historyPageInfo, type HistoryPageInfo, type HistoryPageSize } from "../shopee-import/history-pagination.ts";

type Db = Pick<PrismaClient, "shopeeClickImport"> | Pick<Prisma.TransactionClient, "shopeeClickImport">;
const day = (value: Date) => value.toISOString().slice(0, 10);

export async function getShopeeClickHistory(db: Db, shopeeAccountId: number, requestedPage = 1, pageSize: HistoryPageSize = 25): Promise<{ rows: ClickHistoryRow[]; pagination: HistoryPageInfo }> {
  const where = { shopeeAccountId };
  const total = await db.shopeeClickImport.count({ where });
  const pagination = historyPageInfo(total, requestedPage, pageSize);
  const rows = await db.shopeeClickImport.findMany({ where, skip: (pagination.page - 1) * pagination.pageSize, take: pagination.pageSize, orderBy: { createdAt: "desc" } });
  return { rows: rows.map((row) => ({ ...row, dateFrom: day(row.dateFrom), dateTo: day(row.dateTo), createdAt: row.createdAt.toISOString() })), pagination };
}
