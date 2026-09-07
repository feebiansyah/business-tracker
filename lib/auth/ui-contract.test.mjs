import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("login is responsive, uses email/password, generic errors, and has no registration", async () => {
  const [page, form, action] = await Promise.all([
    readFile(new URL("../../app/login/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../components/auth/login-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/login/actions.ts", import.meta.url), "utf8"),
  ]);
  assert.match(form, /name="email"/);
  assert.match(form, /type="password"/);
  assert.match(form, /w-full/);
  assert.match(action, /LOGIN_ERROR_MESSAGE/);
  assert.doesNotMatch(page + form, /register|Daftar|Sign up/i);
});

test("shell exposes logout and root layout keeps login outside AppShell", async () => {
  const [sidebar, layout] = await Promise.all([
    readFile(new URL("../../components/layout/sidebar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(sidebar, /logoutAction/);
  assert.match(layout, /x-bt-pathname/);
});
