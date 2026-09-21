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
});

test("Clickadu history modal has Meta-like interaction with isolated Clickadu loading", () => {
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /Escape/);
  assert.match(modal, /getClickaduDailyHistoryAction/);
  for (const column of ["Tanggal", "Budget", "Spend", "Komisi"]) assert.match(modal, new RegExp(column));
  assert.match(modal, /currency:\s*["']IDR["']/);
  assert.doesNotMatch(modal, /CampaignDailyMetric|getFilterCampaignDetailAction/);
});
