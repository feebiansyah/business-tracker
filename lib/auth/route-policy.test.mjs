import assert from "node:assert/strict";
import test from "node:test";
import { isPublicPath } from "./route-policy.ts";

test("only login and framework assets are public application paths", () => {
  assert.equal(isPublicPath("/login"), true);
  for (const path of ["/", "/wl", "/shopee", "/shopee/2/import", "/settings", "/meta"]) assert.equal(isPublicPath(path), false);
});
