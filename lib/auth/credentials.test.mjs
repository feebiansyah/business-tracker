import assert from "node:assert/strict";
import test from "node:test";
import { authenticateCredentials, hashPassword, normalizeEmail, validateNewUserInput, verifyPassword } from "./credentials.ts";

test("email normalization trims and lowercases", () => assert.equal(normalizeEmail("  Admin@Example.COM "), "admin@example.com"));

test("new user input validates email, name, and a 12 character password", () => {
  assert.deepEqual(validateNewUserInput({ email: " ADMIN@example.com ", name: " Admin ", password: "long-password" }), { email: "admin@example.com", name: "Admin", password: "long-password" });
  assert.throws(() => validateNewUserInput({ email: "bad", name: "Admin", password: "long-password" }), /Email tidak valid/);
  assert.throws(() => validateNewUserInput({ email: "a@b.com", name: "Admin", password: "short" }), /minimal 12/);
});

test("password hash verifies without storing plaintext", async () => {
  const hash = await hashPassword("long-password");
  assert.notEqual(hash, "long-password");
  assert.equal(await verifyPassword("long-password", hash), true);
  assert.equal(await verifyPassword("wrong-password", hash), false);
});

test("authentication rejects unknown, wrong password, and inactive users generically", async () => {
  const passwordHash = await hashPassword("long-password");
  const active = { id: 1, email: "admin@example.com", name: "Admin", isActive: true, passwordHash };
  const findUser = async (email) => email === active.email ? active : null;
  assert.equal((await authenticateCredentials(" ADMIN@example.com ", "long-password", { findUser })).id, 1);
  for (const [email, password] of [["missing@example.com", "long-password"], [active.email, "wrong-password"]]) {
    await assert.rejects(authenticateCredentials(email, password, { findUser }), /Email atau password salah/);
  }
  await assert.rejects(authenticateCredentials(active.email, "long-password", { findUser: async () => ({ ...active, isActive: false }) }), /Email atau password salah/);
});
