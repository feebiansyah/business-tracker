import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getClientPagination } from "./client-pagination.ts";

test("client pagination handles empty and short result sets", () => {
  assert.deepEqual(getClientPagination(0, 1, 50), { page: 1, pageCount: 1, startIndex: 0, endIndex: 0, from: 0, to: 0 });
  assert.deepEqual(getClientPagination(12, 1, 50), { page: 1, pageCount: 1, startIndex: 0, endIndex: 12, from: 1, to: 12 });
});

test("client pagination clamps the last page after slicing sorted rows", () => {
  assert.deepEqual(getClientPagination(101, 3, 50), { page: 3, pageCount: 3, startIndex: 100, endIndex: 101, from: 101, to: 101 });
  assert.equal(getClientPagination(101, 99, 50).page, 3);
});

test("candidate copy uses the complete candidate result rather than the visible page", async () => {
  const source = await readFile(new URL("./candidate-list.tsx", import.meta.url), "utf8");
  assert.match(source, /ids\.length/);
  assert.match(source, /navigator\.clipboard\.writeText\(ids\.join\(", "\)\)/);
  assert.doesNotMatch(source, /slice\(/);
});
