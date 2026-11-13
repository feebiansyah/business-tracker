import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import test from "node:test";

const page = await readFile(new URL("../../app/shopee/[id]/clickadu-roi/page.tsx", import.meta.url), "utf8");
const list = await readFile(new URL("../../components/clickadu-roi/campaign-report-list.tsx", import.meta.url), "utf8");

test("Clickadu page keeps existing workflows and adds a config-backed report list", () => {
  for (const existing of ["ClickaduCredentialForm", "ClickaduConfigForm", "ClickaduAnalysisWorkflow"]) assert.match(page, new RegExp(existing));
  assert.match(page, /ClickaduCampaignReportList/);
  assert.match(list, /campaign\.label \|\| campaign\.campaignId/);
  assert.doesNotMatch(list, /Tanggal snapshot/);
  assert.doesNotMatch(list, /Sync Clickadu|setSelected|laporan harian/);
});

test("Dedetstudio has no Clickadu history modal or history action entry point", async () => {
  assert.equal(existsSync(new URL("../../components/clickadu-roi/campaign-history-modal.tsx", import.meta.url)), false);
  const actions = await readFile(new URL("../../app/shopee/[id]/clickadu-roi/actions.ts", import.meta.url), "utf8");
  assert.doesNotMatch(actions, /getClickaduDailyHistoryAction|syncClickaduDailyAction/);
});
