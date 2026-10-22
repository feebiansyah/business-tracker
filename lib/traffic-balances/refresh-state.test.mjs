import assert from "node:assert/strict";
import test from "node:test";

const domain = await import("./refresh-state.ts").catch(() => ({}));
const key = { shopeeAccountId: 1, provider: "ADSTERRA" };
const success = { ...key, status: "SUCCESS", balance: "12.34567", currency: "USD", updatedAt: "2026-10-22T01:00:00Z" };
test("refresh controller exists", () => assert.equal(typeof domain.createBalanceStore, "function"));

test("failed refresh preserves prior balance and successful timestamp", async () => {
  let calls = 0;
  const store = domain.createBalanceStore(async () => ++calls === 1 ? [success] : [{ ...key, status: "ERROR", message: "Gagal memuat saldo." }]);
  await store.refresh([key]);
  await store.refresh([key]);
  const state = Object.values(store.getSnapshot())[0];
  assert.equal(state.status, "ERROR");
  assert.equal(state.balance, "12.34567");
  assert.equal(state.updatedAt, success.updatedAt);
});

test("overlapping refreshes deduplicate and a new mounted store does not reuse old balance", async () => {
  let resolve;
  let calls = 0;
  const store = domain.createBalanceStore(async () => { calls++; return new Promise((done) => { resolve = done; }); });
  const first = store.refresh([key]);
  await store.refresh([key]);
  assert.equal(calls, 1);
  assert.equal(Object.values(store.getSnapshot())[0].status, "LOADING");
  resolve([success]); await first;
  assert.equal(Object.values(store.getSnapshot())[0].balance, "12.34567");
  assert.deepEqual(domain.createBalanceStore(async () => []).getSnapshot(), {});
});

test("stale completion cannot overwrite a newer request", () => {
  const state = { status: "LOADING", requestId: 2, balance: "50", updatedAt: "newer", message: "" };
  assert.deepEqual(domain.completeBalanceRefresh(state, 1, success), state);
});

test("transport failure or missing result becomes a safe independent error", async () => {
  for (const load of [async () => { throw new Error("secret-token"); }, async () => []]) {
    const store = domain.createBalanceStore(load);
    await store.refresh([key]);
    assert.equal(Object.values(store.getSnapshot())[0].status, "ERROR");
    assert.doesNotMatch(JSON.stringify(store.getSnapshot()), /secret-token/);
  }
});

test("USD display rounds only for display and WIB timestamp crosses UTC midnight correctly", () => {
  assert.equal(domain.formatBalanceUsd("1234.565"), "1.234,57 USD");
  assert.equal(domain.formatBalanceUsd("-0.004"), "0,00 USD");
  assert.match(domain.formatBalanceTime("2026-10-21T18:05:00Z"), /22 Okt 2026.*01[.:]05.*WIB/);
});
