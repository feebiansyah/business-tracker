import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTag } from "./tags.ts";

test("normalizes only surrounding whitespace and case", () => {
  assert.deepEqual(normalizeTag("  Ab-c_ 12  ", 2), {
    display: "Ab-c_ 12",
    normalized: "AB-C_ 12",
  });
  assert.throws(() => normalizeTag("   ", 7), /Baris 7/);
});
