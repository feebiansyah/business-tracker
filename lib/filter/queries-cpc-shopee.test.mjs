import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("./queries.ts", import.meta.url);

test("history SQL sorts CPC Shopee using commission per Shopee click", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const expression = source.match(/CASE WHEN dm\.commission IS NULL OR dm\.shopeeClicks IS NULL OR dm\.shopeeClicks = 0 THEN NULL ELSE dm\.commission \/ dm\.shopeeClicks END AS cpcShopee/);
  assert.ok(expression, "CPC Shopee SQL must use commission / shopeeClicks with null and zero guards");
  assert.doesNotMatch(source, /ELSE COALESCE\(dm\.spend, 0\) \/ dm\.shopeeClicks END AS cpcShopee/);
  assert.match(source, /cpcShopee: "metric\.cpcShopee"/);
});
