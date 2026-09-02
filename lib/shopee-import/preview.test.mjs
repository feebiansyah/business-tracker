import assert from "node:assert/strict";
import test from "node:test";
import { buildShopeeCommissionPreview } from "./preview.ts";

const encode = (text) => new TextEncoder().encode(text);

function previewCsv() {
  return encode(`Waktu Pemesanan,Tag_link2,Komisi Bersih Affiliate (Rp)
2026-09-01 10:00:00,MATCHED,100
2026-09-01 11:00:00,NO-MATCH,1000
2026-09-02 10:00:00,DUPLICATE,20
2026-09-02 11:00:00,   ,999
2026-09-01 12:00:00,matched,50`);
}

function previewDeps() {
  return {
    accountCalls: 0,
    campaignCalls: 0,
    transactionCalls: 0,
    writeCalls: 0,
    async accountExists(id) {
      this.accountCalls += 1;
      return id === 2;
    },
    async loadCampaigns(id) {
      this.campaignCalls += 1;
      assert.equal(id, 2);
      return [
        { id: 11, name: " matched " },
        { id: 21, name: "DUPLICATE" },
        { id: 22, name: "duplicate" },
      ];
    },
    async withTransaction() {
      this.transactionCalls += 1;
      throw new Error("preview must not open a transaction");
    },
    async persist() {
      this.writeCalls += 1;
      throw new Error("preview must not persist");
    },
  };
}

test("builds a serializable preview with one campaign load and zero writes", async () => {
  const deps = previewDeps();
  const preview = await buildShopeeCommissionPreview(
    {
      shopeeAccountId: 2,
      originalFilename: `../folder/${"a".repeat(300)}.csv`,
      bytes: previewCsv(),
    },
    deps,
  );

  assert.equal(deps.accountCalls, 1);
  assert.equal(deps.campaignCalls, 1);
  assert.equal(deps.transactionCalls, 0);
  assert.equal(deps.writeCalls, 0);
  assert.equal(preview.originalFilename.length, 255);
  assert.equal(preview.originalFilename.includes("/"), false);
  assert.deepEqual(
    {
      dateFrom: preview.dateFrom,
      dateTo: preview.dateTo,
      csvRowCount: preview.csvRowCount,
      tagCount: preview.tagCount,
      matchedCount: preview.matchedCount,
      unmatchedCount: preview.unmatchedCount,
      matchedCommission: preview.matchedCommission,
      unmatchedCommission: preview.unmatchedCommission,
    },
    {
      dateFrom: "2026-09-01",
      dateTo: "2026-09-02",
      csvRowCount: 5,
      tagCount: 3,
      matchedCount: 1,
      unmatchedCount: 2,
      matchedCommission: "150.00000",
      unmatchedCommission: "1020.00000",
    },
  );
  assert.deepEqual(preview.unmatched, [
    {
      date: "2026-09-01",
      tagLink2: "NO-MATCH",
      commission: "1000.00000",
      rowCount: 1,
      reason: "CAMPAIGN_NOT_FOUND",
    },
    {
      date: "2026-09-02",
      tagLink2: "DUPLICATE",
      commission: "20.00000",
      rowCount: 1,
      reason: "AMBIGUOUS_CAMPAIGN_NAME",
    },
  ]);
  assert.match(preview.fileSha256, /^[a-f0-9]{64}$/);
  assert.match(preview.matchDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(preview.confirmation).sort(), ["fileSha256", "matchDigest"]);
});

test("rejects invalid or missing Shopee accounts before loading campaigns", async () => {
  const invalidDeps = previewDeps();
  await assert.rejects(
    () =>
      buildShopeeCommissionPreview(
        { shopeeAccountId: 0, originalFilename: "report.csv", bytes: previewCsv() },
        invalidDeps,
      ),
    /Akun Shopee tidak valid/,
  );
  assert.equal(invalidDeps.accountCalls, 0);
  assert.equal(invalidDeps.campaignCalls, 0);

  const missingDeps = previewDeps();
  await assert.rejects(
    () =>
      buildShopeeCommissionPreview(
        { shopeeAccountId: 3, originalFilename: "report.csv", bytes: previewCsv() },
        missingDeps,
      ),
    /Akun Shopee tidak ditemukan/,
  );
  assert.equal(missingDeps.accountCalls, 1);
  assert.equal(missingDeps.campaignCalls, 0);
});

test("preview preserves exact five-decimal matched and unmatched commissions", async () => {
  const bytes = encode(`Waktu Pemesanan,Tag_link2,Komisi Bersih Affiliate (Rp)
2026-09-01 10:00:00,CAMPAIGN-A,839.99997
2026-09-01 11:00:00,CAMPAIGN-A,0.00003
2026-09-01 12:00:00,CAMPAIGN-B,22985.94997`);
  const preview = await buildShopeeCommissionPreview(
    { shopeeAccountId: 2, originalFilename: "precision.csv", bytes },
    {
      async accountExists() {
        return true;
      },
      async loadCampaigns() {
        return [{ id: 11, name: "CAMPAIGN-A" }];
      },
    },
  );

  assert.equal(preview.matchedCommission, "840.00000");
  assert.equal(preview.unmatchedCommission, "22985.94997");
  assert.equal(preview.unmatched[0].commission, "22985.94997");
});
