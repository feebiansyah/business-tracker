import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("settings action is read-only, scoped, and supports all campaign workspace modes", async () => {
  const source = await readFile(new URL("./meta-settings-actions.ts", import.meta.url), "utf8");
  assert.match(source, /requireUser\(\{ readOnly: true \}\)/);
  assert.match(source, /campaignModeWhere\(parsed\.mode\)/);
  assert.match(source, /metaAccount: \{ shopeeAccountId: parsed\.shopeeAccountId \}/);
  assert.match(source, /campaignModes\.includes/);
  assert.match(source, /prisma\.campaign\.findFirst/);
  assert.doesNotMatch(source, /\.(create|update|upsert|delete|deleteMany|updateMany)\s*\(/);
  assert.doesNotMatch(source, /POST|PATCH|PUT/);
});

test("settings action exposes a generic failure without provider secrets", async () => {
  const source = await readFile(new URL("./meta-settings-actions.ts", import.meta.url), "utf8");
  assert.match(source, /catch \{/);
  assert.match(source, /Tidak ada data yang diubah/);
  assert.doesNotMatch(source, /error\.message/);
});
