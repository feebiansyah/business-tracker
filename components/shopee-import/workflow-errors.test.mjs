import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { loadTs } from "../../lib/filter/sync-baseline.test.mjs";

const require = createRequire(import.meta.url), React = require("react");
function harness(kind, actions) {
  let index = 0, focusCount = 0, refreshes = 0;
  const hooks = [], effects = [];
  const hook = create => { const i = index++; if (!(i in hooks)) hooks[i] = create(); return [hooks[i], i]; };
  const react = { ...React,
    useState: initial => { const [value, i] = hook(() => initial); return [value, next => { hooks[i] = typeof next === "function" ? next(hooks[i]) : next; }]; },
    useReducer: (reducer, initial) => { const [value, i] = hook(() => initial); return [value, action => { hooks[i] = reducer(hooks[i], action); }]; },
    useRef: initial => hook(() => ({ current: initial }))[0],
    useEffect: (fn, deps) => { const [old, i] = hook(() => null); if (!old || deps.some((v, j) => v !== old[j])) { hooks[i] = deps; effects.push(fn); } },
  };
  const api = loadTs(`components/shopee-import/${kind === "commission" ? "import" : "click-import"}-workflow.tsx`, {
    react, "next/navigation": { useRouter: () => ({ refresh() { refreshes++; } }) },
    "@/app/shopee/[id]/import/actions": actions,
    "@/components/ui/button": { Button: "button" },
    "./history-pagination": { ImportHistoryPagination: "pagination" },
    "./import-history-table": { ImportHistoryTable: "history-table" },
    "./preview-summary": { PreviewSummary: "preview-summary" },
    "./unmatched-table": { UnmatchedTable: "unmatched-table" },
  });
  const component = kind === "commission" ? api.ImportWorkflow : api.ClickImportWorkflow;
  const all = node => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
  const render = () => {
    index = 0;
    const tree = component({ shopeeAccountId: 7, history: [], historyPagination: {}, historyState: {} });
    const nodes = all(tree), alert = nodes.find(n => n.props?.role === "alert");
    if (alert?.props.ref) alert.props.ref.current = { focus() { focusCount++; } };
    effects.splice(0).forEach(fn => fn());
    return nodes;
  };
  const button = text => render().find(n => n.props?.onClick && n.props?.children === text);
  const selectFile = size => render().find(n => n.type === "input" && n.props.type === "file").props.onChange({ target: { files: [new File([new Uint8Array(size)], "report.csv")] } });
  return { render, button, selectFile, get focusCount() { return focusCount; }, get refreshes() { return refreshes; } };
}

for (const kind of ["commission", "click"]) {
  const previewLabel = kind === "commission" ? "Preview" : "Preview Klik";
  const importLabel = kind === "commission" ? "Import Sekarang" : "Import Klik Sekarang";
  const keys = kind === "commission" ? ["previewShopeeCommissionAction", "importShopeeCommissionAction"] : ["previewShopeeClickAction", "importShopeeClickAction"];
  test(`${kind}: oversize file is rejected before request with visible focused alert`, async () => {
    let calls = 0; const actions = Object.fromEntries(keys.map(k => [k, async () => { calls++; }]));
    const h = harness(kind, actions); h.selectFile((kind === "commission" ? 15 : 10) * 1024 * 1024 + 1);
    await h.button(previewLabel).props.onClick();
    const alert = h.render().find(n => n.props?.role === "alert");
    assert.match(alert?.props.children, new RegExp(`${kind === "commission" ? 15 : 10} MiB`));
    assert.equal(calls, 0); assert.equal(h.button(previewLabel).props.disabled, false); assert(h.focusCount > 0);
  });
  test(`${kind}: action rejection and thrown preview error release loading without raw internals`, async () => {
    for (const thrown of [false, true]) {
      const h = harness(kind, { [keys[0]]: async () => { if (thrown) throw Error("SQL token hidden"); return { success: false, message: "CSV melebihi batas baris data." }; } });
      h.selectFile(1);
      await assert.doesNotReject(() => h.button(previewLabel).props.onClick());
      const error = h.render().find(n => n.props?.role === "alert")?.props.children;
      assert.equal(typeof error, "string"); assert.doesNotMatch(error, /SQL|token hidden/);
      assert.equal(h.button(previewLabel).props.disabled, false);
    }
  });
  test(`${kind}: import exception reports uncertain outcome, releases controls and never retries`, async () => {
    let calls = 0, release;
    const preview = { confirmation: { fileSha256: "a", matchDigest: "b" }, unmatched: [] };
    const h = harness(kind, { [keys[0]]: async () => ({ success: true, preview }), [keys[1]]: async () => { calls++; await new Promise(r => { release = r; }); throw Error("private SQL response"); } });
    h.selectFile(1); await h.button(previewLabel).props.onClick();
    const pending = h.button(importLabel).props.onClick();
    assert(h.render().filter(n => n.props?.onClick).every(n => n.props.disabled));
    release(); await assert.doesNotReject(() => pending);
    const alert = h.render().find(n => n.props?.role === "alert");
    assert.match(alert?.props.children, /riwayat import/i); assert.doesNotMatch(alert.props.children, /private SQL|belum tersimpan/i);
    assert.equal(calls, 1); assert.equal(h.refreshes, 0); assert.equal(h.button(previewLabel).props.disabled, false);
  });
  test(`${kind}: import action result preserves confirmation, restores buttons and refreshes only on success`, async () => {
    for (const success of [false, true]) {
      const confirmation = { fileSha256: "original-hash", matchDigest: "original-digest" };
      let calls = 0;
      const h = harness(kind, {
        [keys[0]]: async () => ({ success: true, preview: { confirmation, unmatched: [] } }),
        [keys[1]]: async (id, token, data) => {
          calls++; assert.equal(id, 7); assert.equal(token, confirmation); assert.equal(data.get("file").size, 1);
          return success ? { success: true, receipt: { matchedClicks: 1, unmatchedClicks: 0, matchedCount: 1, unmatchedCount: 0, matchedCommission: "1.00000", unmatchedCommission: "0.00000" } } : { success: false, message: "CSV melebihi batas baris data." };
        },
      });
      h.selectFile(1); await h.button(previewLabel).props.onClick(); await h.button(importLabel).props.onClick();
      assert.equal(calls, 1); assert.equal(h.refreshes, success ? 1 : 0);
      assert.equal(h.button(previewLabel).props.disabled, false);
      if (!success) assert.equal(h.render().find(n => n.props?.role === "alert")?.props.children, "CSV melebihi batas baris data.");
    }
  });
}
