import assert from "node:assert/strict";
import test from "node:test";
import { createSessionToken, hashSessionToken, resolveSessionUser, revokeSession, sessionExpiry, SESSION_MAX_AGE_SECONDS } from "./session-core.ts";

test("session uses random token, deterministic hash, and fixed seven day expiry", () => {
  const first = createSessionToken();
  const second = createSessionToken();
  assert.notEqual(first, second);
  assert.equal(hashSessionToken(first), hashSessionToken(first));
  assert.notEqual(hashSessionToken(first), first);
  const now = new Date("2026-09-07T00:00:00.000Z");
  assert.equal(sessionExpiry(now).toISOString(), "2026-09-14T00:00:00.000Z");
  assert.equal(SESSION_MAX_AGE_SECONDS, 604800);
});

test("session lookup accepts active valid sessions and rejects invalid, expired, or inactive sessions", async () => {
  const token = "raw-token";
  const active = { id: 1, email: "a@example.com", name: "A", isActive: true };
  const valid = { tokenHash: hashSessionToken(token), expiresAt: new Date("2026-09-08T00:00:00Z"), user: active };
  assert.deepEqual(await resolveSessionUser(token, new Date("2026-09-07T00:00:00Z"), { findSession: async () => valid, deleteSession: async () => {} }), { id: 1, email: active.email, name: active.name });
  assert.equal(await resolveSessionUser("bad", new Date(), { findSession: async () => null, deleteSession: async () => {} }), null);
  let deleted = false;
  assert.equal(await resolveSessionUser(token, new Date("2026-09-09T00:00:00Z"), { findSession: async () => valid, deleteSession: async () => { deleted = true; } }), null);
  assert.equal(deleted, true);
  assert.equal(await resolveSessionUser(token, new Date("2026-09-07T00:00:00Z"), { findSession: async () => ({ ...valid, user: { ...active, isActive: false } }), deleteSession: async () => {} }), null);
});

test("logout revokes the hashed database session token", async () => {
  let deletedHash = "";
  await revokeSession("browser-token", { deleteSession: async (tokenHash) => { deletedHash = tokenHash; } });
  assert.equal(deletedHash, hashSessionToken("browser-token"));
  assert.notEqual(deletedHash, "browser-token");
});
