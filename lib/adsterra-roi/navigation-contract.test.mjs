import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Adsterra ROI is a Shopee workflow rather than a global placeholder", async () => {
  const navigation = await readFile(new URL("../../components/layout/navigation.ts", import.meta.url), "utf8");
  const state = await readFile(new URL("../../components/layout/navigation-state.ts", import.meta.url), "utf8");
  assert.match(navigation, /adsterra-roi.*Adsterra ROI/);
  assert.match(state, /"adsterra-roi"/);
  assert.doesNotMatch(navigation, /href:\s*"\/terra"/);
});
