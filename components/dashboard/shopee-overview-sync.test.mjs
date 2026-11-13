import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { loadTs } from "../../lib/filter/sync-baseline.test.mjs";
const require = createRequire(import.meta.url), React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
const summary = { wlTotal: 61, wlSucceeded: 17, wlFailed: 0, wlSkipped: 0, campaignsProcessed: 100, insightRowsStored: 1000, unresolvedBudgets: 0, missingStartDates: 0, failedWlNames: [], skippedWlNames: [] };
const progress = (status = "RUNNING") => ({ runId: "run1", status, targetDate: "2026-11-06", total: 61, current: 18, wlName: "WL 18", phase: "ACCOUNT_SPEND", summary, message: null });
const result = (status = "RUNNING", blocked = false) => ({ success: status === "COMPLETE", message: status, summary, metaBatch: { progress: progress(status), shouldContinue: status === "RUNNING" && !blocked, paused: status === "PAUSED_RATE_LIMIT", blocked } });

function uiHarness(action, initialMetaProgress) {
  const hooks = [], effects = [], tasks = []; let cursor = 0, refreshes = 0, trafficCalls=0;
  const hook = make => { const i = cursor++; if (!(i in hooks)) hooks[i] = make(); return [hooks[i],i]; };
  const fakeReact = {
    ...React,
    useRef: value => hook(() => ({ current: value }))[0],
    useState: value => { const [state,i] = hook(() => typeof value === "function" ? value() : value); return [state, value => { hooks[i] = typeof value === "function" ? value(hooks[i]) : value; }]; },
    useEffect: fn => { const [,i] = hook(() => { effects.push(fn()); return true; }); void i; },
    useTransition: () => { const [state] = hook(() => ({ pending: false })); return [state.pending, fn => { state.pending=true; const task = Promise.resolve().then(fn).finally(() => { state.pending=false; }); tasks.push(task); }]; },
  };
  const Button = props => React.createElement("button",props);
  const component = loadTs("components/dashboard/shopee-overview-sync.tsx",{
    react: fakeReact, "next/navigation": { useRouter: () => ({ refresh: () => { refreshes++; } }) },
    "@/app/shopee/[id]/filter/actions": { syncFilterAction: action },
    "@/app/shopee/[id]/clickadu-roi/actions": { syncClickaduDailyAction: async () => { trafficCalls++; return { success: true, message: "traffic" }; } },
    "@/app/shopee/[id]/adsterra-roi/actions": { syncAdsterraDailyAction: async () => { trafficCalls++; return { success: true, message: "traffic" }; } },
    "@/components/ui/button": { Button },
  }).ShopeeOverviewSync;
  const render = () => { cursor=0; return component({ accountId: 7, disabledReasons: { meta: null, clickadu: null, adsterra: "Belum ada campaign." }, initialMetaProgress }); };
  const find = (node,label) => {
    if (Array.isArray(node)) return node.map(n => find(n,label)).find(Boolean);
    if (!node || typeof node !== "object") return null;
    if (node.type === Button && (node.props.children === label || node.props.children === `Menyinkronkan ${label.replace("Sync ","")}...`)) return node;
    return find(node.props?.children,label);
  };
  return { render, button: label => find(render(),label), html: () => renderToStaticMarkup(render()), settle: async () => { for (const task of tasks) await task; }, unmount: () => effects.forEach(fn => fn?.()), refreshes: () => refreshes, trafficCalls: () => trafficCalls };
}

test("one click drives Meta batches sequentially, locks duplicates, then shows COMPLETE", async () => {
  let calls = 0, release;
  const gate = new Promise(resolve => { release=resolve; });
  const h = uiHarness(async () => { calls++; if (calls===1) { await gate; return result(); } return result("COMPLETE"); });
  h.button("Sync Meta").props.onClick(); h.button("Sync Meta").props.onClick();
  await new Promise(resolve => setImmediate(resolve)); assert.equal(calls,1); assert.equal(h.button("Sync Meta").props.disabled,true);
  release(); await h.settle(); assert.equal(calls,2); assert.match(h.html(),/COMPLETE/); assert.equal(h.refreshes(),1); assert.equal(h.button("Sync Meta").props.disabled,false);
});
test("reload renders persisted WL progress; paused/blocked/partial responses stop without another call", async () => {
  const initial = uiHarness(async () => result("COMPLETE"),progress()); assert.match(initial.html(),/WL 18 dari 61/);
  for (const [state,blocked] of [["PAUSED_RATE_LIMIT",false],["RUNNING",true],["PARTIAL",false]]) {
    let calls=0; const h = uiHarness(async () => { calls++; return result(state,blocked); });
    h.button("Sync Meta").props.onClick(); await h.settle(); assert.equal(calls,1); assert.match(h.html(),new RegExp(state));
  }
});
test("unmount after a response loss stops scheduling; action errors never auto-retry", async () => {
  let calls=0,release; const gate = new Promise(resolve => { release=resolve; });
  const h = uiHarness(async () => { calls++; await gate; return result(); });
  h.button("Sync Meta").props.onClick(); await new Promise(resolve => setImmediate(resolve)); h.unmount(); release(); await h.settle(); assert.equal(calls,1);
  const failed = uiHarness(async () => { throw new Error("network"); }); failed.button("Sync Meta").props.onClick(); await failed.settle(); assert.match(failed.html(),/Sebagian data mungkin sudah tersimpan/);
});
test("Dedetstudio Overview offers only Sync Meta and cannot invoke Traffic sync", async () => {
  const h = uiHarness(async () => result("COMPLETE"));
  assert.equal(h.button("Sync Adsterra"), undefined);
  assert.equal(h.button("Sync Clickadu"), undefined);
  assert.doesNotMatch(h.html(), /Clickadu|Adsterra/);
  h.button("Sync Meta").props.onClick(); await h.settle(); assert.equal(h.trafficCalls(),0); assert.match(h.html(),/Meta: COMPLETE/);
});

test("Meta action authenticates, runs exactly one bounded batch and preserves revalidation targets", async () => {
  let auth=0,batches=0; const paths=[];
  const action = loadTs("app/shopee/[id]/filter/actions.ts",{
    "next/cache": { revalidatePath: value => paths.push(value) }, "@/lib/auth/session": { requireUser: async () => { auth++; } },
    "@/lib/prisma": { prisma: {} }, "@/lib/filter/queries": {}, "@/lib/filter/manual-metric": {}, "@/lib/filter/campaign-modes": {},
    "@/lib/filter/meta-sync-batch": { runMetaSyncBatch: async () => { batches++; return result("COMPLETE").metaBatch; } },
    "@/lib/filter/sync": { FilterSyncError: Error, syncFilter: async () => { throw new Error("unbounded path used"); } },
  }).syncFilterAction;
  const response = await action(7,{ success: false, message: "" });
  assert.equal(auth,1); assert.equal(batches,1); assert.equal(response.metaBatch.progress.status,"COMPLETE");
  assert.deepEqual(paths,["/shopee/7","/shopee/7/filter","/shopee/7/fix","/shopee/7/off-filter","/shopee/7/off-fix","/wl"]);
});
