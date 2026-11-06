import assert from "node:assert/strict";
import test from "node:test";
import { loadTs } from "../filter/sync-baseline.test.mjs";
const config = { apiVersion: "v23.0", accessToken: "fake-token-only" };
const api = () => loadTs("lib/meta/client.ts",{ __date: Date, "@/lib/meta/config": { getMetaConfig: () => config } });
const response = (data,after) => new Response(JSON.stringify({ data, ...(after ? { paging: { cursors: { after } } } : {}) }));

test("legacy methods preserve all-page order, request parameters and default absence of signal", async t => {
  const calls = [];
  t.mock.method(globalThis,"fetch",async (url,options) => { calls.push({ url: new URL(url), options }); return calls.length===1 ? response([{ id: "a" }],"cursor2") : response([{ id: "b" }]); });
  const client = new (api().MetaGraphClient)(config);
  assert.deepEqual(await client.getCampaigns("123"),[{ id: "a" },{ id: "b" }]);
  assert.equal(calls.length,2); assert.equal(calls[0].url.pathname,"/v23.0/act_123/campaigns");
  assert.equal(calls[1].url.searchParams.get("after"),"cursor2"); assert.equal(calls[0].url.searchParams.get("limit"),"100");
  assert.equal(calls[0].options.signal,undefined); assert.equal(calls[0].options.cache,"no-store");
});
test("resumable fetch hangs until abort and actually stops before the deadline", async t => {
  let alive = 0, aborted = false;
  t.mock.method(globalThis,"fetch",(_url,{ signal }) => new Promise((_resolve,reject) => {
    alive++; signal.addEventListener("abort",() => { alive--; aborted = true; reject(signal.reason); },{ once: true });
  }));
  const { MetaGraphClient, MetaSyncPauseError } = api();
  await assert.rejects(new MetaGraphClient(config).getSyncPage("campaigns","123",undefined,{ deadline: Date.now()+40 }),MetaSyncPauseError);
  assert.equal(alive,0); assert.equal(aborted,true);
});
test("one-page cursor resumes without repeating the first page and deadline prevents another GET", async t => {
  const cursors = [];
  t.mock.method(globalThis,"fetch",async url => { const after = new URL(url).searchParams.get("after"); cursors.push(after); return after ? response([{ id: "b" }]) : response([{ id: "a" }],"next"); });
  const client = new (api().MetaGraphClient)(config);
  const first = await client.getSyncPage("campaigns","123",undefined,{ deadline: Date.now()+1000 });
  assert.equal(first.after,"next"); assert.deepEqual(first.data,[{ id: "a" }]);
  await assert.rejects(client.getSyncPage("campaigns","123",undefined,{ after: first.after, deadline: Date.now()-1 }));
  const last = await client.getSyncPage("campaigns","123",undefined,{ after: first.after, deadline: Date.now()+1000 });
  assert.equal(last.after,undefined); assert.deepEqual(cursors,[null,"next"]);
});
test("excessive Retry-After pauses immediately and external abort stops backoff without retry", async t => {
  let calls = 0;
  t.mock.method(globalThis,"fetch",async () => { calls++; return new Response(JSON.stringify({ error: { code: 17, message: "limit" } }),{ status: 429, headers: { "retry-after": "1000" } }); });
  const client = new (api().MetaGraphClient)(config);
  const started = Date.now();
  await assert.rejects(client.getSyncPage("campaigns","123",undefined,{ deadline: Date.now()+500 }),error => error.reason === "RETRY_AFTER");
  assert(Date.now()-started < 500); assert.equal(calls,1);
  t.mock.restoreAll();
  t.mock.method(globalThis,"fetch",async () => { calls++; return new Response(JSON.stringify({ error: { code: 17, message: "limit" } }),{ status: 429 }); });
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(),30);
  await assert.rejects(client.getSyncPage("campaigns","123",undefined,{ deadline: Date.now()+5000, signal: controller.signal }));
  clearTimeout(timer); assert.equal(calls,2);
});
test("resumable status uses original fields and GET only, repeated cursor is rejected", async t => {
  const calls = [];
  t.mock.method(globalThis,"fetch",async (url,options) => { calls.push({ url: new URL(url), options }); return new Response(JSON.stringify({ account_status: 2 })); });
  const client = new (api().MetaGraphClient)(config);
  assert.equal(await client.getSyncAccountStatus("123",{ deadline: Date.now()+1000 }),2);
  assert.equal(calls[0].url.searchParams.get("fields"),"account_status"); assert.equal(calls[0].options.method,undefined);
  t.mock.restoreAll();
  t.mock.method(globalThis,"fetch",async () => response([],"same"));
  await assert.rejects(client.getSyncPage("campaigns","123",undefined,{ deadline: Date.now()+1000, after: "same" }));
});

test("HTTP-date Retry-After past the deadline pauses without another GET", async t => {
  let calls=0;
  t.mock.method(globalThis,"fetch",async () => ++calls===1 ? new Response(JSON.stringify({ error: { code: 17, message: "limit" } }),{ status: 429, headers: { "retry-after": new Date(Date.now()+60000).toUTCString() } }) : response([]));
  const client = new (api().MetaGraphClient)(config);
  await assert.rejects(client.getSyncPage("campaigns","123",undefined,{ deadline: Date.now()+4000 }),error => error.reason === "RETRY_AFTER" && error.rateLimited);
  assert.equal(calls,1);
});
test("resumable usage can be restored across units and retains the 3000ms inter-WL throttle", async t => {
  const first = new (api().MetaGraphClient)(config);
  t.mock.method(globalThis,"fetch",async () => new Response(JSON.stringify({ data: [] }),{ headers: { "x-app-usage": JSON.stringify({ call_count: 95 }) } }));
  await first.getSyncPage("campaigns","123",undefined,{ deadline: Date.now()+1000 });
  const next = new (api().MetaGraphClient)(config); next.restoreSyncUsagePercent(first.getSyncUsagePercent());
  assert.equal(next.getSyncUsagePercent(),95);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let done=false; const pending = next.waitBetweenAccounts().then(() => { done=true; });
  t.mock.timers.tick(2999); await Promise.resolve(); assert.equal(done,false);
  t.mock.timers.tick(1); await pending; assert.equal(done,true);
});

test("deadline aborts a stalled response body and closes the fake provider connection", async t => {
  const { createServer } = await import("node:http");
  let closed=false, onClose;
  const closeObserved = new Promise(resolve => { onClose=resolve; });
  const server = createServer((request,response) => {
    response.writeHead(200,{ "content-type": "application/json" }); response.write('{"data":[');
    request.on("close",() => { closed=true; onClose(); });
  });
  await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
  const { createRequire } = await import("node:module");
  const { fetch: originalFetch } = createRequire(import.meta.url)("next/dist/compiled/@edge-runtime/primitives/fetch");
  t.mock.method(globalThis,"fetch",(_url,options) => originalFetch(`http://127.0.0.1:${server.address().port}`,options));
  try {
    const { MetaGraphClient, MetaSyncPauseError } = api();
    await assert.rejects(new MetaGraphClient(config).getSyncPage("campaigns","123",undefined,{ deadline: Date.now()+500 }),MetaSyncPauseError);
    let timer;
    try { await Promise.race([closeObserved,new Promise((_resolve,reject) => { timer=setTimeout(() => reject(new Error("connection remained open")),2000); })]); }
    finally { clearTimeout(timer); }
    assert.equal(closed,true);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
