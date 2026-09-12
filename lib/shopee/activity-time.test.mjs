import assert from "node:assert/strict";
import test from "node:test";
import { formatShopeeActivityTime } from "./activity-time.ts";

test("formats Shopee activity in Jakarta as dd MMM yyyy, HH:mm WIB", () => {
  assert.equal(formatShopeeActivityTime(new Date("2026-09-12T07:20:00.000Z")), "12 Sep 2026, 14:20 WIB");
});

test("returns the caller-specific fallback when activity does not exist", () => {
  assert.equal(formatShopeeActivityTime(null, "Belum pernah Import Komisi"), "Belum pernah Import Komisi");
  assert.equal(formatShopeeActivityTime(null, "Belum pernah Import Klik"), "Belum pernah Import Klik");
});
