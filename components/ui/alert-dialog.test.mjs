import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./alert-dialog.tsx", import.meta.url), "utf8");

test("AlertDialog has explicit cancel/confirm controls and a disabled Loader2 busy state", () => {
  assert.match(source, /role="alertdialog"/);
  assert.match(source, /onClick=\{onCancel\}/);
  assert.match(source, /onClick=\{onConfirm\}/);
  assert.match(source, /disabled=\{busy\}/g);
  assert.match(source, /<Loader2 className="size-4 animate-spin"/);
});
