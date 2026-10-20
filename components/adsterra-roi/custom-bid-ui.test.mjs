import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("placement table renders ID/GLOBAL prices without rounding and preserves pagination", () => {
  const script = `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import placementModule from './components/adsterra-roi/placement-table.tsx';
    const { PlacementTable } = placementModule;
    const rows = Array.from({ length: 51 }, (_, index) => ({ placement: String(index + 1), impressions: 100, clicks: 10, spent: '1', spentUsd: '1', costIdr: '2000', commission: '2300', profit: '300', roi: '15', isBlacklistCandidate: false }));
    const analysis = { rows, candidatePlacements: [], totalSpentUsd: '51', totalCostIdr: '102000', totalCommission: '117300', totalProfit: '15300', roi: '15' };
    const bids = [
      { placementId: '1', price: '0.012345', countryCode: 'ID' },
      { placementId: '1', price: '0.00001', countryCode: 'GLOBAL' },
      { placementId: '2', price: '0', countryCode: 'GLOBAL' },
    ];
    const render = (customBids) => renderToStaticMarkup(React.createElement(PlacementTable, { analysis, customBids }));
    console.log(JSON.stringify({ ready: render({ success: true, bids }), failed: render({ success: false, message: 'Custom Bid gagal dimuat.' }), loading: render(null) }));
  `;
  const html = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }));
  assert.match(html.ready, /Custom Bid/);
  assert.match(html.ready, /ID: 0\.012345/);
  assert.match(html.ready, /GLOBAL: 0\.00001/);
  assert.match(html.ready, /GLOBAL: 0</);
  assert.match(html.ready, /Tanpa override ID\/GLOBAL/);
  assert.match(html.ready, /overflow-x-auto/);
  assert.match(html.ready, /Halaman 1 dari 2/);
  assert.equal((html.ready.match(/<tr>/g) ?? []).length, 51); // header + 50 of 51 placements
  assert.match(html.failed, /Gagal dimuat/);
  assert.doesNotMatch(html.failed, /Tanpa override/);
  assert.match(html.loading, /Memuat/);
  assert.doesNotMatch(html.loading, /Tanpa override/);
});

test("Custom Bid server action authenticates and reuses only scoped config and credential", async () => {
  const actions = await readFile(new URL("../../app/shopee/[id]/adsterra-roi/actions.ts", import.meta.url), "utf8");
  const action = actions.match(/export async function getAdsterraCustomBidsAction[\s\S]*?(?=\nexport async function|$)/)?.[0] ?? "";
  assert.match(action, /await requireUser\(\)/);
  assert.match(action, /loadAdsterraCustomBids\(shopeeAccountId, configId/);
  assert.match(action, /getAdsterraConfigById\(prisma, accountId, id\)/);
  assert.match(action, /loadClient: scopedAdsterraClient/);
  assert.doesNotMatch(action, /replaceBlacklist|setCampaignActive|revalidatePath/);
});


test("Custom Bid editor exposes independent ID save/delete controls without touching blacklist", async () => {
  const [editor, table, workflow] = await Promise.all([
    readFile(new URL("./custom-bid-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("./placement-table.tsx", import.meta.url), "utf8"),
    readFile(new URL("./analysis-workflow.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(editor, /type="number"/);
  assert.match(editor, /placeholder="Contoh: 0\.015"/);
  assert.match(editor, /min="0"/);
  assert.match(editor, /max="200"/);
  assert.match(editor, /Simpan/);
  assert.match(editor, /Hapus/);
  assert.match(editor, /onSubmit=\{save\}/);
  assert.match(editor, /window\.confirm/);
  assert.match(editor, /mengubah data Adsterra sungguhan/);
  assert.match(table, /CustomBidEditor/);
  assert.match(table, /onSaveBid/);
  assert.match(table, /onDeleteBid/);
  assert.match(workflow, /saveAdsterraCustomBidAction/);
  assert.match(workflow, /deleteAdsterraCustomBidAction/);
  assert.match(workflow, /bidWriteInFlight/);
  assert.doesNotMatch(editor, /replaceAdsterraBlacklistAction|setAdsterraCampaignActiveAction/);
});

test("Custom Bid mutation actions authenticate and scope to the stored campaign", async () => {
  const actions = await readFile(new URL("../../app/shopee/[id]/adsterra-roi/actions.ts", import.meta.url), "utf8");
  for (const name of ["saveAdsterraCustomBidAction", "deleteAdsterraCustomBidAction"]) {
    const start = actions.indexOf("export async function " + name + "(");
    const next = actions.indexOf("\nexport async function", start + 1);
    const body = start < 0 ? "" : actions.slice(start, next < 0 ? undefined : next);
    assert.match(body, /await requireUser\(\)/);
    assert.match(body, /writeAdsterraPlacementCustomBid/);
    assert.match(body, /getAdsterraConfigById\(prisma, accountId, id\)/);
    assert.match(body, /loadClient: scopedAdsterraClient/);
    assert.match(body, /experiment: await customBidExperiment\(\)/);
    assert.doesNotMatch(body, /replaceAdsterraBlacklist|setAdsterraCampaignActive/);
  }
});

test("existing editor fields support localhost create and keep edit/delete controls", () => {
  const script = `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import editorModule from './components/adsterra-roi/custom-bid-editor.tsx';
    const { CustomBidEditor } = editorModule;
    const render = (bids) => renderToStaticMarkup(React.createElement(CustomBidEditor, {placement:'1', result:{success:true,bids}, onSave:async()=>{}, onDelete:async()=>{}}));
    console.log(JSON.stringify({empty:render([]), existing:render([{placementId:'1',countryCode:'ID',price:'0.01'}])}));
  `;
  const html = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }));
  assert.match(html.empty, /target localhost.*server/);
  assert.doesNotMatch(html.empty, /<input[^>]*disabled=""/);
  assert.doesNotMatch(html.existing, /<input[^>]*disabled=""/);
  assert.match(html.existing, /Hapus/);
});
