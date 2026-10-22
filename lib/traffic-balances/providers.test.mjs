import assert from "node:assert/strict";
import test from "node:test";

const domain = await import("./providers.ts").catch(() => ({}));

test("balance reader exists", () => assert.equal(typeof domain.requestTrafficBalance, "function"));

for (const [provider, body, expected] of [
  ["CLICKADU", '{"result":{"advertiser":{"balance":0}}}', "0"],
  ["CLICKADU", '{"result":{"advertiser":{"balance":-12.34567890123456789}}}', "-12.34567890123456789"],
  ["ADSTERRA", '{"item":"1999.97"}', "1999.97"],
  ["ADSTERRA", '{"item":"-0.0012300"}', "-0.00123"],
  ["ADSTERRA", '{"item":0}', "0"],
]) {
  test(`${provider} preserves valid decimal balance ${expected}`, async () => {
    const result = await domain.requestTrafficBalance(provider, "private-token", { fetchImpl: async (url, init) => {
      assert.equal(url, provider === "CLICKADU" ? "https://ssp.clickadu.com/api/v2/client/balance/" : "https://api3.adsterratools.com/advertiser/balance.json");
      assert.equal(init.method, "GET");
      assert.equal(init.cache, "no-store");
      assert.equal(init.redirect, "error");
      assert.equal(init.headers.Accept, "application/json");
      assert.equal(init.headers[provider === "CLICKADU" ? "Authorization" : "X-API-Key"], "private-token");
      assert.ok(init.signal instanceof AbortSignal);
      return new Response(body);
    } });
    assert.equal(result, expected);
  });
}

for (const provider of ["CLICKADU", "ADSTERRA"]) {
  for (const invalid of [null, "", "   ", true, false, "NaN", "Infinity", {}, [], "12USD"]) {
    test(`${provider} rejects invalid balance ${JSON.stringify(invalid)}`, async () => {
      const body = provider === "CLICKADU" ? { result: { advertiser: { balance: invalid } } } : { item: invalid };
      await assert.rejects(domain.requestTrafficBalance(provider, "private-token", { fetchImpl: async () => Response.json(body) }));
    });
  }
  for (const body of ["{}", "not-json", '{"item":1e9999}', '{"result":{"advertiser":{}}}']) {
    test(`${provider} rejects absent/malformed response ${body}`, async () => {
      await assert.rejects(domain.requestTrafficBalance(provider, "private-token", { fetchImpl: async () => new Response(body) }));
    });
  }
  for (const status of [400, 401, 404, 429, 500]) {
    test(`${provider} HTTP ${status} is safe and never retried`, async () => {
      let calls = 0;
      await assert.rejects(domain.requestTrafficBalance(provider, "private-token", { fetchImpl: async () => {
        calls++;
        return new Response('private-token provider-secret-body', { status });
      } }), (error) => {
        assert.doesNotMatch(error.message, /private-token|provider-secret-body/);
        return true;
      });
      assert.equal(calls, 1);
    });
  }
}

test("timeout is bounded even if the network implementation ignores abort", async () => {
  await assert.rejects(domain.requestTrafficBalance("ADSTERRA", "private-token", {
    timeoutMs: 10, fetchImpl: async () => new Promise(() => {}),
  }), /waktu|timeout/i);
});

test("body read timeout and network errors never expose tokens", async () => {
  await assert.rejects(domain.requestTrafficBalance("CLICKADU", "private-token", {
    timeoutMs: 10, fetchImpl: async () => ({ ok: true, text: async () => new Promise(() => {}) }),
  }));
  await assert.rejects(domain.requestTrafficBalance("CLICKADU", "private-token", {
    fetchImpl: async () => { throw new Error("private-token secret-url"); },
  }), (error) => { assert.doesNotMatch(error.message, /private-token|secret-url/); return true; });
});

test("numeric-token preservation must not repair invalid JSON property names", async () => {
  for (const [provider, body] of [
    ["ADSTERRA", '{"item":0,1:2}'],
    ["CLICKADU", '{"result":{"advertiser":{"balance":5}},1:2}'],
  ]) {
    await assert.rejects(domain.requestTrafficBalance(provider, "private-token", {
      fetchImpl: async () => new Response(body),
    }));
  }
});
