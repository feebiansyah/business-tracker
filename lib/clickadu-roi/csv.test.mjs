import assert from "node:assert/strict";
import test from "node:test";

import { decodeClickaduShopeeCsv } from "./csv.ts";
import { aggregateZoneCommissions } from "./shopee-aggregation.ts";

const encode = (text) => new TextEncoder().encode(text);

test("filters normalized source tags and aggregates exact commission by trimmed zone", () => {
  const rows = decodeClickaduShopeeCsv(
    encode(`\uFEFFWaktu Pemesanan,Tag_link1,Tag_link3,Komisi Bersih Affiliate (Rp)
2026-09-12 10:00:00, adu ,"00123",839.99997
2026-09-15 10:00:00,ADU,00123,0.00003
2026-09-10 10:00:00,ADU1,999,500
2026-09-16 10:00:00,ADU,   ,700
2026-08-31 10:00:00,OTHER,777,900`),
  );

  const result = aggregateZoneCommissions(rows, "  ADU ", "2026-08-31", "2026-09-16");

  assert.equal(result.csvRowCount, 5);
  assert.equal(result.processedRowCount, 2);
  assert.equal(result.ignoredRowCount, 3);
  assert.deepEqual(result.zones, [
    { zone: "00123", commission: "840.00000", rowCount: 2 },
  ]);
  assert.equal(result.totalCommission, "840.00000");
});
test("supports quoted CSV values and rejects a missing required header clearly", () => {
  const rows = decodeClickaduShopeeCsv(
    encode('Waktu Pemesanan;Tag_link1;Tag_link3;Komisi Bersih Affiliate (Rp)\n2026-09-12 10:00:00;ADU;"zone;7";1,234'),
  );
  assert.equal(rows[0].tagLink3, "zone;7");

  assert.throws(
    () => decodeClickaduShopeeCsv(encode("Waktu Pemesanan,Tag_link1,Tag_link3\n2026-09-12 10:00:00,ADU,123")),
    /Komisi Bersih Affiliate \(Rp\).*wajib ada/i,
  );
});

test("Clickadu period filters CSV transactions without requiring boundary rows", () => {
  const partialRows = decodeClickaduShopeeCsv(encode(`Waktu Pemesanan,Tag_link1,Tag_link3,Komisi Bersih Affiliate (Rp)
2026-09-12 10:00:00,ADU,2,20
2026-09-15 10:00:00,ADU,3,30`));
  assert.deepEqual(aggregateZoneCommissions(partialRows, "ADU", "2026-09-01", "2026-09-15").zones.map((row) => row.zone), ["2", "3"]);

  const mixedRows = decodeClickaduShopeeCsv(encode(`Waktu Pemesanan,Tag_link1,Tag_link3,Komisi Bersih Affiliate (Rp)
2026-08-31 10:00:00,ADU,1,10
2026-09-12 10:00:00,ADU,2,20
2026-09-16 10:00:00,ADU,4,40`));
  assert.deepEqual(aggregateZoneCommissions(mixedRows, "ADU", "2026-09-01", "2026-09-15").zones.map((row) => row.zone), ["2"]);
  assert.throws(() => aggregateZoneCommissions(mixedRows, "ADU", "2026-09-01", "2026-09-10"), /CSV Shopee tidak memiliki data pada periode yang dipilih/);
});
