import assert from "node:assert/strict";
import test from "node:test";
import { parseCommission } from "./commission.ts";

test("parses exact accepted IDR forms", () => {
  for (const [input, expected] of [
    ["50000", "50000.00"],
    ["50000.25", "50000.25"],
    ["50.000", "50.00"],
    ["Rp 50.000,25", "50000.25"],
    ["-1.000,50", "-1000.50"],
    ["0", "0.00"],
  ]) {
    assert.equal(parseCommission(input, 2).toFixed(2), expected);
  }
});

test("preserves Shopee commission values with up to five decimal places", () => {
  for (const [input, expected] of [
    ["839.99997", "839.99997"],
    ["22985.94997", "22985.94997"],
    ["Rp 2.927,81994", "2927.81994"],
    ["1,234", "1.23400"],
  ]) {
    assert.equal(parseCommission(input, 2).toFixed(5), expected);
  }
  assert.throws(() => parseCommission("1.123456", 9), /Baris 9/);
});

test("treats a plain numeric value with one dot as a Shopee decimal", () => {
  assert.equal(parseCommission("980.475", 2).toFixed(5), "980.47500");
});

test("rejects invalid grouping, exponent, excess scale, and decimal overflow", () => {
  for (const input of [
    "1.00.0",
    "1e3",
    "10000000000000000.00",
    "NaN",
    "Infinity",
  ]) {
    assert.throws(() => parseCommission(input, 9), /Baris 9/);
  }
});
