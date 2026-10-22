import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { loadTrafficBalances } from "./service.ts";

// Execute the real server action with only external auth/DB/provider dependencies replaced.
async function actionFixture({ signedIn = true } = {}) {
  const events = [];
  const db = { shopeeAccount: { findMany: async (query) => {
    events.push(["DB", query]); return [{ id: 7 }];
  } } };
  const source = await readFile(new URL("../../app/traffic-balances/actions.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  const modules = {
    "@/lib/auth/session": { requireUser: async () => { events.push(["AUTH"]); if (!signedIn) throw new Error("AUTH_REQUIRED"); } },
    "@/lib/prisma": { prisma: db },
    "@/lib/traffic-credentials/crypto": { decryptTrafficSecret: (secret) => { assert.equal(secret, "encrypted-private"); return "private-token"; } },
    "@/lib/traffic-credentials/repository": { getEncryptedTrafficCredential: async (database, id, provider) => {
      assert.equal(database, db); events.push(["CREDENTIAL", id, provider]);
      return { shopeeAccountId: id, provider, encryptedSecret: "encrypted-private" };
    } },
    "@/lib/traffic-balances/providers": { requestTrafficBalance: async (provider, token) => {
      assert.equal(token, "private-token"); events.push(["GET", provider]); return "-1.23456789";
    } },
    "@/lib/traffic-balances/service": { loadTrafficBalances },
  };
  vm.runInNewContext(compiled, { exports, require: (id) => {
    assert.ok(id in modules, `Unexpected dependency: ${id}`); return modules[id];
  } });
  return { action: exports.getTrafficBalancesAction, events };
}

test("server action authenticates before all reads and returns only sanitized balance fields", async () => {
  const f = await actionFixture();
  const result = await f.action([{ shopeeAccountId: 7, provider: "CLICKADU" }]);
  assert.equal(result.success, true);
  assert.deepEqual(f.events[0], ["AUTH"]);
  assert.deepEqual(JSON.parse(JSON.stringify(f.events[1])), ["DB", { where: { id: { in: [7] } }, select: { id: true } }]);
  assert.deepEqual(f.events[2], ["CREDENTIAL", 7, "CLICKADU"]);
  assert.equal(result.balances[0].balance, "-1.23456789");
  assert.doesNotMatch(JSON.stringify(result), /private|encryptedSecret|token/);
});

test("unauthenticated callers never reach DB or provider", async () => {
  const f = await actionFixture({ signedIn: false });
  await assert.rejects(f.action([{ shopeeAccountId: 7, provider: "ADSTERRA" }]), /AUTH_REQUIRED/);
  assert.deepEqual(f.events, [["AUTH"]]);
});

test("invalid account scope is rejected after authentication without external reads", async () => {
  const f = await actionFixture();
  const result = await f.action([{ shopeeAccountId: -7, provider: "ADSTERRA" }]);
  assert.equal(result.success, false);
  assert.deepEqual(f.events, [["AUTH"]]);
});
