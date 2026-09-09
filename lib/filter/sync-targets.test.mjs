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

test("sync snapshots resolved budgets on the current Jakarta date without another Meta request", async () => {
  const source = await readFile(new URL("./sync.ts", import.meta.url), "utf8");
  assert.match(source, /if \(budget\.amount !== null\) await upsertCampaignDailyBudgetSnapshot\(prisma, stored\.id, today, budget\.amount\)/);
  assert.doesNotMatch(source, /upsertCampaignDailyBudgetSnapshot[\s\S]*getCampaignInsights[\s\S]*getCampaignInsights/);
});

test("sync requests account-level daily spend in bounded ranges", async () => {
  const source = await readFile(new URL("./sync.ts", import.meta.url), "utf8");
  assert.match(source, /getAccountDailySpend\(wl\.accountId, range\)/);
  assert.match(source, /persistMetaAccountDailySpend/);
});

test("semantic backfill completion is persisted only after all insight chunks", async () => {
  const source = await readFile(new URL("./sync.ts", import.meta.url), "utf8");
  const chunkLoop = source.indexOf("for (const chunk of coverage.chunks)");
  const persist = source.indexOf("persistInsightChunk(", chunkLoop);
  const complete = source.indexOf("markCampaignMetricSemanticBackfillComplete", persist);
  assert.ok(chunkLoop >= 0 && persist > chunkLoop && complete > persist);
});

test("new campaigns start on current metric semantics without mutating existing versions", async () => {
  const source = await readFile(new URL("./persistence.ts", import.meta.url), "utf8");
  assert.match(source, /create: \{ metaCampaignId: input\.metaCampaignId, metaMetricSemanticVersion: CURRENT_META_METRIC_SEMANTIC_VERSION/);
  const updatePayload = source.slice(source.indexOf("const metadata ="), source.indexOf("return prisma.campaign.upsert"));
  assert.doesNotMatch(updatePayload, /metaMetricSemanticVersion/);
});
