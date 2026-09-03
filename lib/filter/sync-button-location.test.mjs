import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Meta sync is scoped from Shopee detail and absent from Filter", async () => {
  const detail = await readFile(new URL("../../app/shopee/[id]/page.tsx", import.meta.url), "utf8");
  const filter = await readFile(new URL("../../app/shopee/[id]/filter/page.tsx", import.meta.url), "utf8");
  assert.match(detail, /SyncMetaButton/);
  assert.match(detail, /shopeeAccountId=\{account\.id\}/);
  assert.doesNotMatch(filter, /SyncMetaButton/);
});
