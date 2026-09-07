import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("every existing business Server Action module requires authentication", async () => {
  for (const path of ["../../app/wl/actions.ts", "../../app/shopee/actions.ts", "../../app/shopee/[id]/filter/actions.ts", "../../app/shopee/[id]/import/actions.ts"]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /requireUser/);
  }
});
