import assert from "node:assert/strict";
import test from "node:test";
import { readCsvUpload } from "./upload.ts";
import { decodeAndParseCsv } from "./csv.ts";
import { parseShopeeClickCsv } from "../shopee-click-import/csv.ts";
import { loadTs } from "../filter/sync-baseline.test.mjs";

const encode = value => new TextEncoder().encode(value);
const commission = size => {
  const prefix = "Waktu Pemesanan,Tag_link2,Komisi Bersih Affiliate (Rp),Extra\n2026-09-01 10:00:00,A,1,";
  return encode(prefix + "x".repeat(size - prefix.length));
};
const form = bytes => { const data = new FormData(); data.set("file", new File([bytes], "report.csv", { type: "text/csv" })); return data; };

test("commission exact 15 MiB traverses real upload and preview action; +1 byte fails", async () => {
  const db = { shopeeAccount: { findUnique: async () => ({ id: 7 }) }, campaign: { findMany: async () => [{ id: 1, name: "A" }] } };
  const action = loadTs("app/shopee/[id]/import/actions.ts", {
    "../../../../lib/prisma": { prisma: db }, "../../../../lib/auth/session": { requireUser: async () => {} }, "next/cache": { revalidatePath() {} },
  });
  const result = await action.previewShopeeCommissionAction(7, form(commission(15 * 1024 * 1024)));
  assert.equal(result.success, true, result.message);
  assert.equal(result.preview.csvRowCount, 1); assert.equal(result.preview.matchedCommission, "1.00000");
  let importedBytes;
  const final = loadTs("app/shopee/[id]/import/actions.ts", {
    "../../../../lib/prisma": { prisma: {} }, "../../../../lib/auth/session": { requireUser: async () => {} }, "next/cache": { revalidatePath() {} },
    "../../../../lib/shopee-import/importer": { validatePreviewConfirmation() {}, importShopeeCommissions: async input => { importedBytes = input.bytes.byteLength; return { importId: 1 }; } },
  });
  assert.equal((await final.importShopeeCommissionAction(7, result.preview.confirmation, form(commission(15 * 1024 * 1024)))).success, true);
  assert.equal(importedBytes, 15 * 1024 * 1024);
  await assert.rejects(() => readCsvUpload(7, form(new Uint8Array(15 * 1024 * 1024 + 1)), 15 * 1024 * 1024), /15 MiB/);
  assert.throws(() => decodeAndParseCsv(new Uint8Array(15 * 1024 * 1024 + 1)), /15 MiB/);
});

test("click accepts all 200000 data rows, rejects 200001, and retains 10 MiB file limit", async () => {
  const header = "Klik ID,Waktu Klik,Wilayah Klik,Tag_link,Perujuk\n";
  const row = "1,2026-09-01,ID,M-A,x\n";
  const parsed = parseShopeeClickCsv(encode(header + row.repeat(200_000)));
  assert.equal(parsed.csvRowCount, 200_000); assert.equal(parsed.rows.length, 200_000);
  assert.throws(() => parseShopeeClickCsv(encode(header + row.repeat(200_001))), /200\.000/);
  assert.throws(() => parseShopeeClickCsv(new Uint8Array(10 * 1024 * 1024 + 1)), /10 MiB/);
  await assert.rejects(() => readCsvUpload(7, form(new Uint8Array(10 * 1024 * 1024 + 1))), /10 MiB/);
  const prefix = header + "1,2026-09-01,ID,M-A,";
  const exact = encode(prefix + "x".repeat(10 * 1024 * 1024 - prefix.length));
  assert.equal((await readCsvUpload(7, form(exact))).bytes.byteLength, 10 * 1024 * 1024);
  assert.equal(parseShopeeClickCsv(exact).rows.length, 1);
});

test("unexpected import action failure reports unknown outcome without exposing internals", async () => {
  const failure = async () => { throw new Error("SQL password must not appear"); };
  const api = loadTs("app/shopee/[id]/import/actions.ts", {
    "../../../../lib/prisma": { prisma: {} }, "../../../../lib/auth/session": { requireUser: async () => {} }, "next/cache": { revalidatePath() {} },
    "../../../../lib/shopee-import/importer": { validatePreviewConfirmation() {}, importShopeeCommissions: failure },
    "../../../../lib/shopee-click-import/importer": { importShopeeClicks: failure },
  });
  const original = console.error; console.error = () => {};
  try {
    for (const action of [api.importShopeeCommissionAction, api.importShopeeClickAction]) {
      const result = await action(7, {}, form(encode("x")));
      assert.equal(result.success, false); assert.match(result.message, /riwayat import/i);
      assert.doesNotMatch(result.message, /SQL|password|belum tersimpan/i);
    }
  } finally { console.error = original; }
});
