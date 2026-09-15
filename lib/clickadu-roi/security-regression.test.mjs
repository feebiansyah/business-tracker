import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function sources(directory) {
  const names = await readdir(new URL(directory, import.meta.url));
  return Promise.all(names.filter((name) => /\.(?:ts|tsx)$/.test(name)).map((name) => readFile(new URL(`${directory}${name}`, import.meta.url), "utf8")));
}

test("Clickadu actions remain authenticated, server-token-only, and scoped", async () => {
  const actions = await readFile(new URL("../../app/shopee/[id]/clickadu-roi/actions.ts", import.meta.url), "utf8");
  const clientSources = (await sources("../../components/clickadu-roi/")).join("\n");
  const featureSources = (await sources("./")).join("\n");
  const actionCount = actions.match(/export async function \w+Action/g)?.length ?? 0;
  const analysisAction = actions.slice(actions.indexOf("export async function analyzeClickaduRoiAction"), actions.indexOf("export async function listClickaduConfigsAction"));
  assert.equal(actions.match(/await requireUser\(\)/g)?.length, actionCount);
  assert.doesNotMatch(clientSources, /CLICKADU_API_TOKEN|@\/lib\/clickadu-roi\/(?:client|config)/);
  assert.doesNotMatch(clientSources, /CLICKADU_API_TOKEN|Authorization|encryptedSecret/);
  assert.doesNotMatch(`${actions}\n${featureSources}`, /writeFile|localStorage|rawCsv\s*:/i);
  assert.doesNotMatch(analysisAction, /formData\.get\(["'](?:campaignId|sourceTag|statistics|commission|roi)/);
});
