import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("sync plans resolved campaign history and keeps account-level insight batching", async () => {
  const source = await readFile(new URL("./sync.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /storedCampaigns\.filter\(\(campaign\) => isFilterCampaign/);
  assert.match(source, /storedCampaigns\.filter\(\(campaign\) => isHistorySyncCampaign/);
  assert.match(source, /getCampaignInsights\(wl\.accountId, \{ since: chunk\.since, until: chunk\.until \}\)/);
  assert.doesNotMatch(source, /getCampaignInsights\([^\n]*campaign/);
});
