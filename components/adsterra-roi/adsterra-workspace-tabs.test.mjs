import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const tabs = await readFile(new URL("./adsterra-workspace-tabs.tsx", import.meta.url), "utf8");
const page = await readFile(new URL("../../app/shopee/[id]/adsterra-roi/page.tsx", import.meta.url), "utf8");

test("Adsterra workspace defaults to Campaign and exposes three compact tabs", () => {
  assert.match(tabs, /useState<WorkspaceTab>\("campaign"\)/);
  for (const label of ["Campaign", "Placement", "Pengaturan"]) assert.match(tabs, new RegExp(`label: "${label}"`));
  assert.match(tabs, /role="tablist"/);
  assert.match(tabs, /aria-selected=\{activeTab === tab\.id\}/);
});

test("page keeps server data loading and places existing workflows in their intended tabs", () => {
  assert.match(page, /getAdsterraConfigPageData\(prisma, accountId\)/);
  assert.match(page, /<AdsterraWorkspaceTabs/);
  assert.match(page, /campaign=\{<AdsterraCampaignReportList/);
  assert.match(page, /placement=\{<AdsterraAnalysisWorkflow/);
  assert.match(page, /settings=\{<div className="space-y-6">\s*<AdsterraCredentialForm[\s\S]*<AdsterraConfigForm/);
  assert.equal((page.match(/<AdsterraCampaignReportList/g) ?? []).length, 1);
  assert.equal((page.match(/<AdsterraAnalysisWorkflow/g) ?? []).length, 1);
  assert.equal((page.match(/<AdsterraCredentialForm/g) ?? []).length, 1);
  assert.equal((page.match(/<AdsterraConfigForm/g) ?? []).length, 1);
});

test("tab client owns presentation state only and does not import business modules", () => {
  assert.doesNotMatch(tabs, /actions|lib\/adsterra|fetch\(|useEffect|useSearchParams|localStorage/);
  assert.match(tabs, /activeTab === "campaign" \? campaign/);
  assert.match(tabs, /activeTab === "placement" \? placement/);
  assert.match(tabs, /activeTab === "settings" \? settings/);
});
