import assert from "node:assert/strict";
import test from "node:test";

import { decodeClickaduShopeeCsv } from "./csv.ts";
import { aggregateZoneCommissions } from "./shopee-aggregation.ts";

const encode = (text) => new TextEncoder().encode(text);

test("filters normalized source tags and aggregates exact commission by trimmed zone", () => {
  const rows = decodeClickaduShopeeCsv(
    encode(`\uFEFFTag_link1,Tag_link3,Komisi Bersih Affiliate (Rp)
 adu ,"00123",839.99997
ADU,00123,0.00003
ADU1,999,500
ADU,   ,700`),
  );

  const result = aggregateZoneCommissions(rows, "  ADU ");

  assert.equal(result.csvRowCount, 4);
  assert.equal(result.processedRowCount, 2);
  assert.equal(result.ignoredRowCount, 2);
  assert.deepEqual(result.zones, [
    { zone: "00123", commission: "840.00000", rowCount: 2 },
  ]);
  assert.equal(result.totalCommission, "840.00000");
});
test("supports quoted CSV values and rejects a missing required header clearly", () => {
  const rows = decodeClickaduShopeeCsv(
    encode('Tag_link1;Tag_link3;Komisi Bersih Affiliate (Rp)\nADU;"zone;7";1,234'),
  );
  assert.equal(rows[0].tagLink3, "zone;7");

  assert.throws(
    () => decodeClickaduShopeeCsv(encode("Tag_link1,Tag_link3\nADU,123")),
    /Komisi Bersih Affiliate \(Rp\).*wajib ada/i,
  );
});
