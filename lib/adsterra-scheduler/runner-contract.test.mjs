import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production scheduler wiring reuses existing credential, client, and verified activity flow", async () => {
  const source = await readFile(new URL("./runner.ts", import.meta.url), "utf8");
  assert.match(source, /import "server-only"/);
  assert.match(source, /getEncryptedTrafficCredential/);
  assert.match(source, /decryptTrafficSecret/);
  assert.match(source, /getAdsterraClient/);
  assert.match(source, /setAndVerifyAdsterraCampaignActive/);
  assert.doesNotMatch(source, /fetch\(|method:\s*["']PATCH|setInterval|setTimeout|cron/i);
});
