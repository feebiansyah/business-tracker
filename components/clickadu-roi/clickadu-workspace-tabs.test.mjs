import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const tabs = await readFile(new URL("./clickadu-workspace-tabs.tsx", import.meta.url), "utf8");
const page = await readFile(new URL("../../app/shopee/[id]/clickadu-roi/page.tsx", import.meta.url), "utf8");

test("Clickadu workspace defaults to Campaign and mirrors the Adsterra tab styling", async () => {
  const adsterraTabs = await readFile(new URL("../adsterra-roi/adsterra-workspace-tabs.tsx", import.meta.url), "utf8");
  assert.match(tabs, /useState<WorkspaceTab>\("campaign"\)/);
  for (const label of ["Campaign", "Zone", "Pengaturan"]) assert.match(tabs, new RegExp(`label: "${label}"`));
  for (const style of ["overflow-x-auto border-b border-slate-200", "flex min-w-max gap-1", "border-blue-600 text-blue-700", "px-4 py-2.5 text-sm font-medium"]) {
    assert.match(tabs, new RegExp(style));
    assert.match(adsterraTabs, new RegExp(style));
  }
});

test("page keeps its existing server query and places each existing workflow in one tab", () => {
  assert.match(page, /getClickaduConfigPageData\(prisma, shopeeAccountId\)/);
  assert.match(page, /<ClickaduWorkspaceTabs/);
  assert.match(page, /campaign=\{<ClickaduCampaignReportList/);
  assert.match(page, /zone=\{<ClickaduAnalysisWorkflow/);
  assert.match(page, /settings=\{<div className="space-y-6">\s*<ClickaduCredentialForm[\s\S]*<ClickaduConfigForm/);
  for (const component of ["ClickaduCampaignReportList", "ClickaduAnalysisWorkflow", "ClickaduCredentialForm", "ClickaduConfigForm"]) {
    assert.equal((page.match(new RegExp(`<${component}`, "g")) ?? []).length, 1);
  }
});

test("Clickadu tab client owns presentation state only", () => {
  assert.doesNotMatch(tabs, /actions|lib\/clickadu|fetch\(|useEffect|useSearchParams|localStorage/);
  assert.match(tabs, /activeTab === "campaign" \? campaign/);
  assert.match(tabs, /activeTab === "zone" \? zone/);
  assert.match(tabs, /activeTab === "settings" \? settings/);
});
