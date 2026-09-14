import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("analysis resolves a Shopee-scoped encrypted CLICKADU credential without global token fallback", async () => {
  const actions = await readFile(new URL("../../app/shopee/[id]/clickadu-roi/actions.ts", import.meta.url), "utf8");
  const config = await readFile(new URL("./config.ts", import.meta.url), "utf8");
  const client = await readFile(new URL("./client.ts", import.meta.url), "utf8");
  const analysisAction = actions.slice(actions.indexOf("export async function analyzeClickaduRoiAction"), actions.indexOf("export async function saveClickaduCredentialAction"));
  assert.match(analysisAction, /getEncryptedTrafficCredential\(prisma,\s*shopeeAccountId,\s*TrafficProvider\.CLICKADU\)/);
  assert.match(analysisAction, /decryptTrafficSecret/);
  assert.doesNotMatch(config, /process\.env\.CLICKADU_API_TOKEN/);
  assert.doesNotMatch(client, /CLICKADU_API_TOKEN/);
  assert.doesNotMatch(analysisAction, /formData\.get\(["'](?:token|secret)/);
});

test("credential actions authenticate, scope by Shopee, and never return a secret", async () => {
  const actions = await readFile(new URL("../../app/shopee/[id]/clickadu-roi/actions.ts", import.meta.url), "utf8");
  assert.match(actions, /saveClickaduCredentialAction/);
  assert.match(actions, /deleteClickaduCredentialAction/);
  assert.doesNotMatch(actions, /return\s*\{[^}]*encryptedSecret/s);
});
