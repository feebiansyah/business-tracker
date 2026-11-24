import assert from "node:assert/strict";
import test from "node:test";
import { MAX_COMMISSION_CSV_BYTES, MAX_CSV_ROWS } from "./constants.ts";
import { decodeAndParseCsv } from "./csv.ts";

const encode = (text) => new TextEncoder().encode(text);

test("parses UTF-8 BOM, quoted commas, escaped quotes, CRLF, and exact required headers", () => {
  const rows = decodeAndParseCsv(
    encode(
      '\uFEFFWaktu Pemesanan,Tag_link1,Komisi Bersih Affiliate (Rp)\r\n2026-09-01 12:30:00,"A,B ""Promo""",1000',
    ),
  );
  assert.deepEqual(rows, [
    {
      logicalRow: 2,
      orderedAt: "2026-09-01 12:30:00",
      tagLink1: 'A,B "Promo"',
      tagLink2: 'A,B "Promo"',
      commission: "1000",
    },
  ]);
});

test("accepts semicolon delimiter, LF, and embedded newline in a quoted field", () => {
  const rows = decodeAndParseCsv(
    encode(
      'Waktu Pemesanan;Tag_link1;Komisi Bersih Affiliate (Rp)\n2026-09-01 12:30;"A\nB";1000',
    ),
  );
  assert.equal(rows[0].tagLink2, "A\nB");
});

test("uses Tag_link1 for Barra campaign matching and still reads the optional zone", () => {
  const [row] = decodeAndParseCsv(encode(
    "Waktu Pemesanan,Tag_link1,Tag_link2,Tag_link3,Komisi Bersih Affiliate (Rp)\n" +
    "2026-09-18 10:00:00,ADU,META-CAMPAIGN,12345,980.475",
  ));
  assert.deepEqual(row, {
    logicalRow: 2,
    orderedAt: "2026-09-18 10:00:00",
    tagLink1: "ADU",
    tagLink2: "ADU",
    tagLink3: "12345",
    commission: "980.475",
  });
});

test("rejects missing, duplicate, ambiguous, and fuzzy headers", () => {
  assert.throws(
    () => decodeAndParseCsv(encode("Waktu Pemesanan,Tag_link1\n2026-09-01 12:30,A")),
    /Komisi Bersih Affiliate \(Rp\)/,
  );
  assert.throws(
    () =>
      decodeAndParseCsv(
        encode(
          "Waktu Pemesanan,Tag_link1,Tag_link1,Komisi Bersih Affiliate (Rp)\n2026-09-01 12:30,A,A,1",
        ),
      ),
    /duplikat/i,
  );
  assert.throws(
    () =>
      decodeAndParseCsv(
        encode(
          "Waktu Pemesanan,Tag Link 1,Komisi Bersih Affiliate (Rp)\n2026-09-01 12:30,A,1",
        ),
      ),
    /Tag_link1/,
  );
  assert.throws(
    () =>
      decodeAndParseCsv(
        encode(
          'Waktu Pemesanan,Tag_link1;Komisi Bersih Affiliate (Rp)\n"2026-09-01;A",1',
        ),
      ),
    /ambigu/i,
  );
});

test("rejects invalid UTF-8, NUL bytes, and empty data", () => {
  assert.throws(() => decodeAndParseCsv(Uint8Array.from([0xff, 0xfe])), /UTF-8/);
  assert.throws(
    () =>
      decodeAndParseCsv(
        encode("Waktu Pemesanan,Tag_link1,Komisi Bersih Affiliate (Rp)\0"),
      ),
    /NUL/,
  );
  assert.throws(
    () =>
      decodeAndParseCsv(
        encode("Waktu Pemesanan,Tag_link1,Komisi Bersih Affiliate (Rp)\n"),
      ),
    /tidak memiliki data/,
  );
});

test("enforces exact byte and logical-row limits", () => {
  assert.throws(() => decodeAndParseCsv(new Uint8Array(MAX_COMMISSION_CSV_BYTES + 1)), /15 MiB/);
  const header = "Waktu Pemesanan,Tag_link1,Komisi Bersih Affiliate (Rp)\n";
  const row = "2026-09-01 12:30:00,A,1\n";
  assert.doesNotThrow(() => decodeAndParseCsv(encode(header + row.repeat(MAX_CSV_ROWS))));
  assert.throws(
    () => decodeAndParseCsv(encode(header + row.repeat(MAX_CSV_ROWS + 1))),
    /100\.000/,
  );
});
