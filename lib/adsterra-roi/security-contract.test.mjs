import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("Adsterra actions authenticate, scope credentials, and keep secrets server-side", async () => {
  const actions = await readFile(new URL("../../app/shopee/[id]/adsterra-roi/actions.ts", import.meta.url), "utf8");
  const componentNames = await readdir(new URL("../../components/adsterra-roi/", import.meta.url));
  const clientSource = (await Promise.all(componentNames.map((name) => readFile(new URL(`../../components/adsterra-roi/${name}`, import.meta.url), "utf8")))).join("\n");
  assert.equal(actions.match(/await requireUser\(\)/g)?.length, 10);
  assert.match(actions, /TrafficProvider\.ADSTERRA/);
  assert.match(actions, /getEncryptedTrafficCredential\(prisma,\s*shopeeAccountId/);
  assert.doesNotMatch(clientSource, /X-API-Key|encryptedSecret|decryptTrafficSecret|ADSTERRA_API_KEY/);
  assert.doesNotMatch(actions, /formData\.get\(["'](?:apiKey|campaignId|sourceTag)["']\).*getPlacementStatistics/);
  const api = await readFile(new URL("./client.ts", import.meta.url), "utf8");
  assert.doesNotMatch(api, /method:\s*["'](?:POST|DELETE)["']/);
  assert.match(api, /campaign\/\$\{campaignId\}\.json`,\s*"PATCH",\s*\{ active \}/);
  assert.match(api, /linking\/blacklist\.json["`],\s*"PUT"/);
});
