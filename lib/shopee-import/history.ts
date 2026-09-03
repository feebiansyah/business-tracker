import type { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import { historyPageInfo, type HistoryPageInfo, type HistoryPageSize } from "./history-pagination.ts";
import type { ShopeeImportPageData } from "./types.ts";

type HistoryDb = Pick<PrismaClient, "shopeeAccount" | "shopeeCommissionImport"> | Pick<Prisma.TransactionClient, "shopeeAccount" | "shopeeCommissionImport">;
const day = (value: Date) => value.toISOString().slice(0, 10);

export async function getShopeeImportPageData(db: HistoryDb, id: number, requestedPage = 1, pageSize: HistoryPageSize = 25): Promise<(ShopeeImportPageData & { pagination: HistoryPageInfo }) | null> {
  const account = await db.shopeeAccount.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!account) return null;
  const where = { shopeeAccountId: id };
  const total = await db.shopeeCommissionImport.count({ where });
  const pagination = historyPageInfo(total, requestedPage, pageSize);
  const rows = await db.shopeeCommissionImport.findMany({
    where, skip: (pagination.page - 1) * pagination.pageSize, take: pagination.pageSize, orderBy: { createdAt: "desc" },
    select: { id: true, originalFilename: true, dateFrom: true, dateTo: true, csvRowCount: true, tagCount: true, matchedCount: true, unmatchedCount: true, matchedCommission: true, unmatchedCommission: true, createdAt: true },
  });
  return {
    shopeeAccount: account, pagination,
    history: rows.map((row) => ({ ...row, dateFrom: day(row.dateFrom), dateTo: day(row.dateTo), matchedCommission: row.matchedCommission.toFixed(5), unmatchedCommission: row.unmatchedCommission.toFixed(5), createdAt: row.createdAt.toISOString() })),
  };
}
