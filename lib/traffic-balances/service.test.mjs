import assert from "node:assert/strict";
import test from "node:test";

const domain = await import("./service.ts").catch(() => ({}));
const keys = [{ shopeeAccountId: 1, provider: "CLICKADU" }, { shopeeAccountId: 1, provider: "ADSTERRA" }];
function deps(overrides = {}) {
  return {
    loadAccounts: async (ids) => ids.map((id) => ({ id })),
    loadCredential: async (id, provider) => ({ shopeeAccountId: id, provider, encryptedSecret: "encrypted-private" }),
    decrypt: () => "plain-private",
    requestBalance: async () => "12.345",
    now: () => new Date("2026-10-22T01:02:03.000Z"),
    ...overrides,
  };
}

test("balance service exists", () => assert.equal(typeof domain.loadTrafficBalances, "function"));
test("uses exact account/provider credential scope without requiring campaign config", async () => {
  const calls = [];
  const result = await domain.loadTrafficBalances(keys, deps({ loadCredential: async (id, provider) => {
    calls.push([id, provider]);
    return { shopeeAccountId: id, provider, encryptedSecret: "encrypted-private" };
  } }));
  assert.deepEqual(calls, [[1, "CLICKADU"], [1, "ADSTERRA"]]);
  assert.deepEqual(result[0], { ...keys[0], status: "SUCCESS", balance: "12.345", currency: "USD", updatedAt: "2026-10-22T01:02:03.000Z" });
  assert.doesNotMatch(JSON.stringify(result), /private|encryptedSecret|token/);
});

test("one failed provider cannot damage another and failures have no timestamp", async () => {
  const result = await domain.loadTrafficBalances(keys, deps({ requestBalance: async (provider) => {
    if (provider === "CLICKADU") throw new Error("plain-private");
    return "0";
  } }));
  assert.equal(result[0].status, "ERROR");
  assert.equal(result[0].updatedAt, undefined);
  assert.equal(result[1].balance, "0");
  assert.doesNotMatch(JSON.stringify(result), /plain-private/);
});

test("no credential means NOT_CONNECTED; foreign credentials and missing accounts never reach provider", async () => {
  let requests = 0;
  const base = deps({ requestBalance: async () => { requests++; return "1"; } });
  assert.equal((await domain.loadTrafficBalances([keys[0]], { ...base, loadCredential: async () => null }))[0].status, "NOT_CONNECTED");
  assert.equal((await domain.loadTrafficBalances([keys[0]], { ...base, loadCredential: async () => ({ shopeeAccountId: 9, provider: "CLICKADU", encryptedSecret: "private" }) }))[0].status, "ERROR");
  assert.equal((await domain.loadTrafficBalances([keys[0]], { ...base, loadAccounts: async () => [] }))[0].status, "ERROR");
  assert.equal(requests, 0);
});

test("arbitrary providers and invalid account IDs are rejected before database reads", async () => {
  for (const input of [null, {}, [{ shopeeAccountId: 0, provider: "CLICKADU" }], [{ shopeeAccountId: "1", provider: "CLICKADU" }], [{ shopeeAccountId: 1, provider: "META" }]]) {
    await assert.rejects(domain.loadTrafficBalances(input, deps({ loadAccounts: async () => assert.fail("invalid input must not query") })));
  }
});

test("duplicates are fetched once, no more than four provider reads overlap", async () => {
  let active = 0, peak = 0, calls = 0;
  const many = Array.from({ length: 9 }, (_, i) => ({ shopeeAccountId: i + 1, provider: "ADSTERRA" }));
  const result = await domain.loadTrafficBalances([...many, many[0]], deps({ requestBalance: async () => {
    calls++; active++; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5)); active--;
    return "-0.25";
  } }));
  assert.equal(result.length, 9);
  assert.equal(calls, 9);
  assert.equal(peak, 4);
});

test("success timestamp is taken after the provider completes", async () => {
  let finished = false;
  const result = await domain.loadTrafficBalances([keys[0]], deps({
    requestBalance: async () => { finished = true; return "5"; },
    now: () => { assert.equal(finished, true); return new Date("2026-10-22T10:00:00Z"); },
  }));
  assert.equal(result[0].updatedAt, "2026-10-22T10:00:00.000Z");
});
