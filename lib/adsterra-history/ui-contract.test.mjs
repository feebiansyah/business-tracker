import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import test from "node:test";

const page = await readFile(new URL("../../app/shopee/[id]/adsterra-roi/page.tsx", import.meta.url), "utf8");
const list = await readFile(new URL("../../components/adsterra-roi/campaign-report-list.tsx", import.meta.url), "utf8");

test("Dedetstudio Adsterra page keeps existing flows without daily report access", () => {
  for (const name of ["AdsterraCredentialForm", "AdsterraConfigForm", "AdsterraAnalysisWorkflow", "AdsterraCampaignReportList"]) assert.match(page, new RegExp(name));
  assert.doesNotMatch(list, /Sync Adsterra|setSelected|laporan harian/);
});
test("Dedetstudio has no Adsterra history modal or history action entry point", async () => {
  assert.equal(existsSync(new URL("../../components/adsterra-roi/campaign-history-modal.tsx", import.meta.url)), false);
  const actions = await readFile(new URL("../../app/shopee/[id]/adsterra-roi/actions.ts", import.meta.url), "utf8");
  assert.doesNotMatch(actions, /getAdsterraDailyHistoryAction|syncAdsterraDailyAction/);
});
