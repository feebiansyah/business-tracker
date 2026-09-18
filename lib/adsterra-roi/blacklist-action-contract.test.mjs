import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Adsterra replacement authenticates and reruns server analysis from original inputs", async () => {
  const actions = await readFile(new URL("../../app/shopee/[id]/adsterra-roi/actions.ts", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../../components/adsterra-roi/analysis-workflow.tsx", import.meta.url), "utf8");
  const start = actions.indexOf("export async function replaceAdsterraBlacklistAction");
  const action = actions.slice(start, actions.indexOf("export async function saveAdsterraCredentialAction"));
  assert.ok(start >= 0);
  assert.match(action, /await requireUser\(\)/);
  assert.match(action, /buildAdsterraRoiAnalysis/);
  assert.match(action, /getAdsterraConfigById\(prisma, accountId, configId\)/);
  assert.match(action, /replaceAdsterraBlacklist/);
  assert.match(action, /runVerifiedBlacklistReplacement/);
  assert.match(action, /markBlacklistReplaced\(prisma, "ADSTERRA", shopeeAccountId, analysis\.config\.id, at\)/);
  assert.doesNotMatch(action, /formData\.get\(["'](?:campaignId|candidate|roi|target)/i);
  assert.match(workflow, /window\.confirm/);
  assert.match(workflow, /Replace Blacklist Adsterra/);
  assert.match(workflow, /replaceInFlight/);
  assert.match(workflow, /Terakhir Replace Blacklist:/);
  assert.doesNotMatch(workflow, /candidatePlacements\s*:/);
});
