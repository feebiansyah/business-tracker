import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { historyPageInfo, parseImportHistoryParams, updateImportHistoryParams } from "./history-pagination.ts";
import { getShopeeImportPageData } from "./history.ts";
import { getShopeeClickHistory } from "../shopee-click-import/history.ts";

test("import histories default to page 1 and 25 rows", () => {
  assert.deepEqual(parseImportHistoryParams({}), { commissionPage: 1, commissionPageSize: 25, clickPage: 1, clickPageSize: 25 });
});

test("invalid history URL params fall back safely", () => {
  assert.deepEqual(parseImportHistoryParams({ commissionPage: "0", commissionPageSize: "30", clickPage: "no", clickPageSize: "999" }), { commissionPage: 1, commissionPageSize: 25, clickPage: 1, clickPageSize: 25 });
});

test("commission and click pagination state remain independent", () => {
  const current = parseImportHistoryParams({ commissionPage: "3", commissionPageSize: "50", clickPage: "4", clickPageSize: "100" });
  assert.deepEqual(updateImportHistoryParams(current, "commission", { page: 2 }), { ...current, commissionPage: 2 });
  assert.deepEqual(updateImportHistoryParams(current, "click", { pageSize: 25 }), { ...current, clickPage: 1, clickPageSize: 25 });
});

test("history page info clamps page and calculates totals", () => {
  assert.deepEqual(historyPageInfo(184, 8, 25), { page: 8, pageSize: 25, total: 184, pageCount: 8, from: 176, to: 184 });
  assert.deepEqual(historyPageInfo(0, 9, 25), { page: 1, pageSize: 25, total: 0, pageCount: 1, from: 0, to: 0 });
});

test("both database history queries use count with skip take and newest-first order", async () => {
  for (const relative of ["./history.ts", "../shopee-click-import/history.ts"]) {
    const source = await readFile(new URL(relative, import.meta.url), "utf8");
    assert.match(source, /\.count\(/);
    assert.match(source, /skip:/);
    assert.match(source, /take:/);
    assert.match(source, /orderBy:\s*\{\s*createdAt:\s*"desc"\s*\}/);
  }
});

test("commission history applies count, skip, take, and newest-first order in the database", async () => {
  let findManyArgs;
  const db = {
    shopeeAccount: { findUnique: async () => ({ id: 2, name: "Shop" }) },
    shopeeCommissionImport: {
      count: async (args) => { assert.deepEqual(args, { where: { shopeeAccountId: 2 } }); return 184; },
      findMany: async (args) => { findManyArgs = args; return []; },
    },
  };
  const result = await getShopeeImportPageData(db, 2, 8, 25);
  assert.deepEqual(findManyArgs, {
    where: { shopeeAccountId: 2 }, skip: 175, take: 25, orderBy: { createdAt: "desc" },
    select: { id: true, originalFilename: true, dateFrom: true, dateTo: true, csvRowCount: true, tagCount: true, matchedCount: true, unmatchedCount: true, matchedCommission: true, unmatchedCommission: true, createdAt: true },
  });
  assert.deepEqual(result.pagination, { page: 8, pageSize: 25, total: 184, pageCount: 8, from: 176, to: 184 });
});

test("click history applies its own page and page size in the database", async () => {
  let findManyArgs;
  const db = { shopeeClickImport: {
    count: async () => 60,
    findMany: async (args) => { findManyArgs = args; return []; },
  } };
  const result = await getShopeeClickHistory(db, 2, 2, 50);
  assert.deepEqual(findManyArgs, { where: { shopeeAccountId: 2 }, skip: 50, take: 50, orderBy: { createdAt: "desc" } });
  assert.deepEqual(result.pagination, { page: 2, pageSize: 50, total: 60, pageCount: 2, from: 51, to: 60 });
});
