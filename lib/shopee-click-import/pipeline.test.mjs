import assert from "node:assert/strict";
import test from "node:test";
import { parseShopeeClickCsv } from "./csv.ts";
import { aggregateShopeeClicks } from "./aggregate.ts";
import { matchClickAggregates } from "./matching.ts";
import { buildShopeeClickPreview } from "./preview.ts";

const encode = (value) => new TextEncoder().encode(value);
const csv = `Klik ID,Waktu Klik,Wilayah Klik,Tag_link,Perujuk\n1,2026-09-01 10:00:00,ID,META-BABYMAHASISWA1---,x\n2,2026-09-01 11:00:00,ID, meta-BABYMAHASISWA1---,x\n3,2026-09-01 12:00:00,ID,ORGANIC-OTHER---,x\n4,2026-09-01 13:00:00,ID,META----,x\n5,2026-09-02 10:00:00,ID,META-MISSING---,x`;

test("processes Tag Link 2 regardless of Tag Link 1", () => {
  const parsed = parseShopeeClickCsv(encode(`Klik ID,Waktu Klik,Wilayah Klik,Tag_link,Perujuk\n1,2026-09-01 10:00:00,ID,META-IDE-UDANG--,x\n2,2026-09-01 11:00:00,ID,METAPRAS-IDE-UDANG--,x\n3,2026-09-01 12:00:00,ID,META----,x`));
  assert.deepEqual(parsed.rows.map((row) => row.tagLink2), ["IDE", "IDE"]);
  assert.equal(parsed.processedRowCount, 2);
  assert.equal(parsed.ignoredRowCount, 1);
});

test("processes every Tag Link 2 and ignores blank Tag Link 2", () => {
  const parsed = parseShopeeClickCsv(encode(csv));
  assert.equal(parsed.csvRowCount, 5);
  assert.equal(parsed.processedRowCount, 4);
  assert.equal(parsed.ignoredRowCount, 1);
  assert.deepEqual(parsed.rows.map((row) => [row.date, row.tagLink2]), [
    ["2026-09-01", "BABYMAHASISWA1"],
    ["2026-09-01", "OTHER"],
    ["2026-09-01", "BABYMAHASISWA1"],
    ["2026-09-02", "MISSING"],
  ]);
});

test("retains BOM, quoted field, semicolon, and UTF-8 CSV protections", () => {
  const parsed = parseShopeeClickCsv(encode(`\uFEFFKlik ID;Waktu Klik;Wilayah Klik;Tag_link;Perujuk\r\n1;2026-09-01 10:00:00;ID;META-CAMPAIGN_A---;"shop; page"`));
  assert.equal(parsed.rows[0].normalizedTagLink2, "CAMPAIGN_A");
  assert.throws(() => parseShopeeClickCsv(encode("Klik ID,Waktu Klik\n1,2026-09-01")), /Header CSV Klik Shopee/);
});

test("aggregates click row counts by date and normalized campaign", () => {
  const result = aggregateShopeeClicks(parseShopeeClickCsv(encode(csv)));
  assert.deepEqual(result.aggregates.map((row) => [row.date, row.normalizedTagLink2, row.clickCount]), [
    ["2026-09-01", "BABYMAHASISWA1", 2],
    ["2026-09-01", "OTHER", 1],
    ["2026-09-02", "MISSING", 1],
  ]);
  assert.equal(result.groupCount, 3);
  assert.equal(result.dateFrom, "2026-09-01");
  assert.equal(result.dateTo, "2026-09-02");
});

test("matches unique campaigns and leaves missing or ambiguous clicks unmatched", () => {
  const aggregates = [
    { date: "2026-09-01", tagLink2: "ONE", normalizedTagLink2: "ONE", clickCount: 2 },
    { date: "2026-09-01", tagLink2: "Missing", normalizedTagLink2: "MISSING", clickCount: 3 },
    { date: "2026-09-01", tagLink2: " A-B ", normalizedTagLink2: "A-B", clickCount: 4 },
  ];
  const result = matchClickAggregates(aggregates, [
    { id: 1, name: " one " }, { id: 2, name: "A-B" }, { id: 3, name: "a-b" }, { id: 4, name: "A B" },
  ]);
  assert.deepEqual(result.matched.map((row) => [row.campaignId, row.clickCount]), [[1, 2]]);
  assert.deepEqual(result.unmatched.map((row) => [row.reason, row.clickCount]), [
    ["CAMPAIGN_NOT_FOUND", 3], ["AMBIGUOUS_CAMPAIGN_NAME", 4],
  ]);
  assert.equal(result.matchedClicks, 2);
  assert.equal(result.unmatchedClicks, 7);
});

test("preview loads scoped campaigns once and performs zero writes", async () => {
  let loads = 0;
  const preview = await buildShopeeClickPreview(
    { shopeeAccountId: 2, originalFilename: "../clicks.csv", bytes: encode(csv) },
    { accountExists: async () => true, loadCampaigns: async () => { loads += 1; return [{ id: 1, name: "BABYMAHASISWA1" }]; } },
  );
  assert.equal(loads, 1);
  assert.equal(preview.originalFilename, "clicks.csv");
  assert.equal(preview.processedRowCount, 4);
  assert.equal(preview.ignoredRowCount, 1);
  assert.equal(preview.matchedClicks, 2);
  assert.equal(preview.unmatchedClicks, 2);
  assert.deepEqual(Object.keys(preview.confirmation).sort(), ["fileSha256", "matchDigest"]);
});
