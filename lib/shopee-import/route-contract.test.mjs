import assert from "node:assert/strict";
import test from "node:test";
import { shopeeWorkflows } from "../../components/layout/navigation.ts";

test("Import Shopee is the first account workflow without changing existing routes", () => {
  assert.deepEqual(shopeeWorkflows.map((item) => item.href), ["import", "filter", "fix", "off-filter", "off-fix"]);
});
