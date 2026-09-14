import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("editing a config remounts uncontrolled inputs with the selected values", async () => {
  const source = await readFile(new URL("./config-form.tsx", import.meta.url), "utf8");
  assert.match(source, /<form\s+key=\{editing\?\.id\s*\?\?\s*["']new["']\}/);
});
