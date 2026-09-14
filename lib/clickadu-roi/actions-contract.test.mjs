import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("analysis action authenticates and accepts only config/date/rate/file truth", async () => {
  const source = await readFile(new URL("../../app/shopee/[id]/clickadu-roi/actions.ts", import.meta.url), "utf8");
  assert.match(source, /analyzeClickaduRoiAction/);
  assert.match(source, /await requireUser\(\)/);
  assert.match(source, /readCsvUpload/);
  assert.match(source, /getClickaduClient/);
  const analysisAction = source.slice(source.indexOf("export async function analyzeClickaduRoiAction"), source.indexOf("export async function listClickaduConfigsAction"));
  assert.doesNotMatch(analysisAction, /formData\.get\(["']campaignId/);
  assert.doesNotMatch(analysisAction, /formData\.get\(["']sourceTag/);
  assert.doesNotMatch(source, /method:\s*["'](?:PUT|PATCH|DELETE)/);
});
