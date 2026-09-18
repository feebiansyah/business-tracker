import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("blacklist replacement is explicit, authenticated, scoped, and re-derives candidates", async () => {
  const actions = await readFile(new URL("../../app/shopee/[id]/clickadu-roi/actions.ts", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../../components/clickadu-roi/analysis-workflow.tsx", import.meta.url), "utf8");
  const start = actions.indexOf("export async function replaceClickaduBlacklistAction");
  const action = actions.slice(start, actions.indexOf("export async function saveClickaduCredentialAction"));
  assert.ok(start >= 0);
  assert.match(action, /await requireUser\(\)/);
  assert.match(action, /buildClickaduRoiAnalysis/);
  assert.match(action, /runVerifiedBlacklistReplacement/);
  assert.match(action, /markBlacklistReplaced\(prisma, "CLICKADU", shopeeAccountId, analysis\.config\.id, at\)/);
  assert.match(action, /getClickaduConfigById\(prisma, accountId, configId\)/);
  assert.doesNotMatch(action, /formData\.get\(["'](?:campaignId|candidateZoneIds|sourceTag)/);
  assert.match(workflow, /window\.confirm/);
  assert.match(workflow, /Replace Blacklist Clickadu/);
  assert.match(workflow, /lastAnalysisForm/);
  assert.match(workflow, /Terakhir Replace Blacklist:/);
  assert.doesNotMatch(workflow, /candidateZoneIds/);
});
