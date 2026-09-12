import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("root dashboard is lightweight and does not load every Shopee performance card", async () => {
  const source = await readFile(new URL("../../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /getDashboardData/);
  assert.doesNotMatch(source, /ShopeePerformanceCard/);
  assert.match(source, /href="\/shopee"/);
});

test("Shopee Overview loads one scoped performance card and keeps its WL list", async () => {
  const source = await readFile(new URL("../../app/shopee/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(source, /getShopeeDashboardData\(shopeeAccountId/);
  assert.match(source, /ShopeePerformanceCard/);
  assert.match(source, /account\.metaAccounts\.map/);
});

test("single-account dashboard query never loads all Shopee accounts", async () => {
  const source = await readFile(new URL("./queries.ts", import.meta.url), "utf8");
  assert.match(source, /getShopeeDashboardData/);
  assert.match(source, /shopeeAccount\.findUnique/);
});
