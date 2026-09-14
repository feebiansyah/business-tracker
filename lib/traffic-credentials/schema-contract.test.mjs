import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("TrafficCredential is additive, provider-scoped, and stores only encrypted secret", async () => {
  const schema = await readFile(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
  assert.match(schema, /enum TrafficProvider\s*\{\s*CLICKADU\s*\}/s);
  assert.match(schema, /model TrafficCredential\s*\{[\s\S]*encryptedSecret\s+String[\s\S]*@@unique\(\[shopeeAccountId, provider\]\)/);
  assert.match(schema, /trafficCredentials\s+TrafficCredential\[\]/);
  assert.doesNotMatch(schema, /CLICKADU_API_TOKEN|plaintext/i);
});
