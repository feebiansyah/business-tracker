import assert from "node:assert/strict";
import test from "node:test";

import { parseClickaduConfigInput } from "./config-input.ts";

test("normalizes campaign, optional label, and Shopee source tag", () => {
  assert.deepEqual(
    parseClickaduConfigInput({ campaignId: " campaign-1 ", label: "   ", sourceTag: " adu1 " }),
    { campaignId: "campaign-1", label: null, sourceTag: "ADU1" },
  );
  assert.deepEqual(
    parseClickaduConfigInput({ campaignId: "campaign-2", label: "  Retargeting  ", sourceTag: "Adu" }),
    { campaignId: "campaign-2", label: "Retargeting", sourceTag: "ADU" },
  );
});

test("rejects empty campaign and source tag", () => {
  assert.throws(
    () => parseClickaduConfigInput({ campaignId: " ", label: null, sourceTag: "ADU" }),
    /Campaign ID.*wajib/i,
  );
  assert.throws(
    () => parseClickaduConfigInput({ campaignId: "campaign-1", label: null, sourceTag: " " }),
    /Source Tag.*wajib/i,
  );
});
