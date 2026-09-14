import assert from "node:assert/strict";
import test from "node:test";
import { decryptTrafficSecret, encryptTrafficSecret } from "./crypto-core.ts";

const key = Buffer.alloc(32, 7).toString("base64");

test("AES-256-GCM round-trips a secret without storing plaintext", () => {
  const encrypted = encryptTrafficSecret("private-api-token", key);
  assert.match(encrypted, /^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
  assert.doesNotMatch(encrypted, /private-api-token/);
  assert.equal(decryptTrafficSecret(encrypted, key), "private-api-token");
  assert.notEqual(encryptTrafficSecret("private-api-token", key), encrypted);
});

test("missing or invalid encryption keys are rejected safely", () => {
  for (const invalid of [undefined, "", Buffer.alloc(31).toString("base64"), "not-base64!"]) {
    assert.throws(() => encryptTrafficSecret("secret", invalid), /encryption key/i);
  }
  assert.throws(() => decryptTrafficSecret("invalid", key), /credential/i);
});
