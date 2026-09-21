import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../../app/shopee/[id]/adsterra-roi/page.tsx", import.meta.url), "utf8");
const modal = await readFile(new URL("../../components/adsterra-roi/campaign-history-modal.tsx", import.meta.url), "utf8");
const list = await readFile(new URL("../../components/adsterra-roi/campaign-report-list.tsx", import.meta.url), "utf8");

test("Adsterra page keeps existing flows and adds automatic daily report", () => {
  for (const name of ["AdsterraCredentialForm", "AdsterraConfigForm", "AdsterraAnalysisWorkflow", "AdsterraCampaignReportList"]) assert.match(page, new RegExp(name));
  assert.match(list, /Sync Adsterra/); assert.doesNotMatch(list, /date|Tanggal snapshot/i);
});
test("Adsterra modal has five server-driven columns without budget", () => {
  for (const label of ["Tanggal", "Spend USD", "Spend IDR", "Komisi", "Profit"]) assert.match(modal, new RegExp(label));
  assert.doesNotMatch(modal, />Budget</); assert.match(modal, /Kurs tetap: \$1 = Rp19\.000/);
  assert.match(modal, /SortableHeader/); assert.match(modal, /TablePagination/); assert.doesNotMatch(modal, /\.sort\(/);
});
