import assert from "node:assert/strict";
import test from "node:test";
import { isPublicPath } from "./route-policy.ts";

test("only login, the authenticated scheduler hook, and framework assets are public application paths", () => {
  assert.equal(isPublicPath("/login"), true);
  assert.equal(isPublicPath("/api/internal/adsterra-scheduler"), true);
  for (const path of ["/", "/wl", "/shopee", "/shopee/2/import", "/settings", "/meta", "/api/internal", "/api/internal/adsterra-scheduler/other"]) assert.equal(isPublicPath(path), false);
});
