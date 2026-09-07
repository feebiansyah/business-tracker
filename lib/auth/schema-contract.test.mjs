import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("auth schema and migration use additive case-safe User and Session tables", async () => {
  const [schema, migration] = await Promise.all([
    readFile("prisma/schema.prisma", "utf8"),
    readFile("prisma/migrations/20260907131906_add_user_auth/migration.sql", "utf8"),
  ]);
  assert.match(schema, /model User[\s\S]*email\s+String\s+@unique/);
  assert.match(schema, /model Session[\s\S]*tokenHash\s+String\s+@unique/);
  assert.match(migration, /CREATE TABLE `User`/);
  assert.match(migration, /CREATE TABLE `Session`/);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE/i);
});

test("user creation stays interactive and never takes a password argument", async () => {
  const source = await readFile("scripts/create-user.mjs", "utf8");
  assert.match(source, /hideOutput = true/);
  assert.doesNotMatch(source, /process\.argv/);
  assert.doesNotMatch(source, /passwordHash.*console|console.*passwordHash/i);
});
