import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildAdsterraOverview, getShopeeAdsterraOverview } from "./adsterra-overview.ts";

test("Adsterra overview aggregates daily metrics with the fixed Rp19.000 rate", () => {
  const result = buildAdsterraOverview([
    { date: new Date("2026-09-01T00:00:00.000Z"), spendUsd: "2.5", commissionIdr: "60000" },
    { date: new Date("2026-09-01T00:00:00.000Z"), spendUsd: "1.5", commissionIdr: "20000" },
    { date: new Date("2026-09-02T00:00:00.000Z"), spendUsd: "1", commissionIdr: "10000" },
  ]);

  assert.deepEqual(result.days, [
    { date: "2026-09-01", spendUsd: "4", spendIdr: "76000", commissionIdr: "80000", profitIdr: "4000", profitPercent: "5.2631578947368421053" },
    { date: "2026-09-02", spendUsd: "1", spendIdr: "19000", commissionIdr: "10000", profitIdr: "-9000", profitPercent: "-47.368421052631578947" },
  ]);
  assert.deepEqual(result.summary, { spendUsd: "5", spendIdr: "95000", commissionIdr: "90000", profitIdr: "-5000", profitPercent: "-5.2631578947368421053" });
});

test("Adsterra overview keeps zero spend finite and reports an empty range", () => {
  const zero = buildAdsterraOverview([{ date: new Date("2026-09-01T00:00:00.000Z"), spendUsd: "0", commissionIdr: "100" }]);
  assert.equal(zero.days[0].profitPercent, null);
  assert.equal(zero.summary.profitPercent, null);
  assert.deepEqual(buildAdsterraOverview([]), { days: [], summary: null });
});

test("Adsterra overview query scopes metrics to one Shopee account and selected dates", async () => {
  const queries = [];
  const result = await getShopeeAdsterraOverview({
    $queryRaw: async (value) => {
      queries.push(value);
      return queries.length === 1
        ? [{ total: 2n, spendUsd: { toString: () => "3" }, commissionIdr: { toString: () => "60000" } }]
        : [{ date: new Date("2026-09-05T00:00:00.000Z"), spendUsd: { toString: () => "2" }, spendIdr: { toString: () => "38000" }, commissionIdr: { toString: () => "40000" }, profitIdr: { toString: () => "2000" }, profitPercent: { toString: () => "5.2631578947368421053" } }];
    },
  }, 17, "2026-09-01", "2026-09-10", { sort: "profit", dir: "asc", page: 2, pageSize: 25 });

  const sql = queries.map((query) => query.sql.replace(/\s+/g, " ")).join(" ");
  assert.match(sql, /AdsterraCampaignDailyMetric metric INNER JOIN AdsterraCampaignConfig config/);
  assert.match(sql, /config\.shopeeAccountId = \?/);
  assert.match(sql, /metric\.date >= \?/);
  assert.match(sql, /metric\.date <= \?/);
  assert.match(sql, /ORDER BY profitIdr IS NULL ASC, profitIdr ASC, date DESC/);
  assert.match(sql, /LIMIT \? OFFSET \?/);
  assert.equal(result.pagination.total, 2);
  assert.equal(result.pagination.page, 1);
  assert.equal(result.summary.spendIdr, "57000");
});

test("Adsterra overview keeps full-range summary when a page contains one daily row", async () => {
  let call = 0;
  const result = await getShopeeAdsterraOverview({
    $queryRaw: async () => {
      call += 1;
      return call === 1
        ? [{ total: 3n, spendUsd: { toString: () => "6" }, commissionIdr: { toString: () => "120000" } }]
        : [{ date: new Date("2026-09-03T00:00:00.000Z"), spendUsd: { toString: () => "1" }, spendIdr: { toString: () => "19000" }, commissionIdr: { toString: () => "20000" }, profitIdr: { toString: () => "1000" }, profitPercent: { toString: () => "5.2631578947368421053" } }];
    },
  }, 17, "", "", { sort: "date", dir: "desc", page: 3, pageSize: 1 });

  assert.equal(result.days.length, 1);
  assert.equal(result.pagination.total, 3);
  assert.equal(result.pagination.page, 3);
  assert.equal(result.summary.spendUsd, "6");
  assert.equal(result.summary.commissionIdr, "120000");
});

test("Shopee overview renders a separate Adsterra section with an explicit empty state", async () => {
  const [page, component] = await Promise.all([
    readFile(new URL("../../app/shopee/[id]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../components/dashboard/shopee-adsterra-overview.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /ShopeeAdsterraOverview/);
  assert.match(component, /Overview Adsterra/);
  assert.match(component, /Belum ada histori harian Adsterra dalam rentang tanggal ini\./);
  assert.match(component, /Kurs tetap: \$1 = Rp19\.000/);
  assert.match(component, /DashboardPageSizeSelect/);
  assert.match(component, /adsterraOverviewParamsToSearch/);
  assert.match(component, /Sebelumnya/);
  assert.match(component, /Berikutnya/);
});
