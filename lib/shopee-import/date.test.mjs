import assert from "node:assert/strict";
import test from "node:test";
import { parseShopeeDate } from "./date.ts";

test("accepts only the locked calendar formats without timezone shifting", () => {
  assert.equal(parseShopeeDate("2026-09-01 23:59:59", 2), "2026-09-01");
  assert.equal(parseShopeeDate("2026-09-01 00:01", 3), "2026-09-01");
  assert.equal(parseShopeeDate("01/09/2026 23:59:59", 4), "2026-09-01");
  assert.equal(parseShopeeDate("01/09/2026 00:01", 5), "2026-09-01");
  assert.equal(parseShopeeDate("2026-09-01", 6), "2026-09-01");
  assert.equal(parseShopeeDate("01/09/2026", 7), "2026-09-01");
});

test("rejects impossible, non-padded, ambiguous, and invalid-time dates with row number", () => {
  assert.throws(() => parseShopeeDate("31/02/2026 10:00", 42), /Baris 42/);
  assert.throws(() => parseShopeeDate("2026-9-1", 43), /Baris 43/);
  assert.throws(() => parseShopeeDate("09/01/26", 44), /Baris 44/);
  assert.throws(() => parseShopeeDate("2026-09-01 24:00", 45), /Baris 45/);
});
