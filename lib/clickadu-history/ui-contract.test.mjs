import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../../app/shopee/[id]/clickadu-roi/page.tsx", import.meta.url), "utf8");
const modal = await readFile(new URL("../../components/clickadu-roi/campaign-history-modal.tsx", import.meta.url), "utf8");
const list = await readFile(new URL("../../components/clickadu-roi/campaign-report-list.tsx", import.meta.url), "utf8");

test("Clickadu page keeps existing workflows and adds a config-backed report list", () => {
  for (const existing of ["ClickaduCredentialForm", "ClickaduConfigForm", "ClickaduAnalysisWorkflow"]) assert.match(page, new RegExp(existing));
  assert.match(page, /ClickaduCampaignReportList/);
  assert.match(list, /campaign\.label \|\| campaign\.campaignId/);
  assert.doesNotMatch(list, /Tanggal snapshot/);
  assert.match(list, /Sync Clickadu/);
});

test("Clickadu history modal has Meta-like interaction with isolated Clickadu loading", () => {
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /Escape/);
  assert.match(modal, /getClickaduDailyHistoryAction/);
  for (const column of ["Tanggal", "Spend USD", "Spend IDR", "Komisi", "Profit"]) assert.match(modal, new RegExp(column));
  assert.doesNotMatch(modal, />Budget</);
  assert.match(modal, /Kurs tetap: \$1 = Rp19\.000/);
  assert.match(modal, /SortableHeader/);
  assert.match(modal, /TablePagination/);
  assert.doesNotMatch(modal, /\.sort\(/);
  assert.match(modal, /currency:\s*["']IDR["']/);
  assert.doesNotMatch(modal, /CampaignDailyMetric|getFilterCampaignDetailAction/);
});
