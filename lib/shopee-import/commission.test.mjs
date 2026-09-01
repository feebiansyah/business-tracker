import assert from "node:assert/strict";
import test from "node:test";
import { parseCommission } from "./commission.ts";

test("parses exact accepted IDR forms", () => {
  for (const [input, expected] of [
    ["50000", "50000.00"],
    ["50000.25", "50000.25"],
    ["50.000", "50000.00"],
    ["Rp 50.000,25", "50000.25"],
    ["-1.000,50", "-1000.50"],
    ["0", "0.00"],
  ]) {
    assert.equal(parseCommission(input, 2).toFixed(2), expected);
  }
});

test("rejects invalid grouping, exponent, excess scale, and Decimal(18,2) overflow", () => {
  for (const input of [
    "1.00.0",
    "1e3",
    "1,234",
    "10000000000000000.00",
    "NaN",
    "Infinity",
  ]) {
    assert.throws(() => parseCommission(input, 9), /Baris 9/);
  }
});
