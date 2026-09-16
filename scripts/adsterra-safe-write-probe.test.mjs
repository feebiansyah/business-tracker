import assert from "node:assert/strict";
import test from "node:test";

import {
  ADSTERRA_CAMPAIGN_ID,
  CONFIRMATION,
  assertTestGuard,
  buildReplacePayload,
  normalizePlacementIds,
  samePlacementSet,
} from "./adsterra-safe-write-probe.mjs";

test("test mode requires the exact campaign and explicit confirmation", () => {
  assert.throws(() => assertTestGuard("test", "wrong"), /konfirmasi/i);
  assert.doesNotThrow(() => assertTestGuard("test", CONFIRMATION));
  assert.equal(ADSTERRA_CAMPAIGN_ID, "1463724");
});

test("replace payload uses only the guarded campaign and normalized placements", () => {
  assert.deepEqual(buildReplacePayload([" 100 ", 200, "100"]), {
    campaign_id: 1463724,
    placement_ids: [100, 200],
  });
});

test("exact placement comparison ignores ordering but rejects extras", () => {
  assert.equal(samePlacementSet(["2", "1"], [1, 2]), true);
  assert.equal(samePlacementSet(["1", "2"], ["1", "2", "3"]), false);
  assert.deepEqual(normalizePlacementIds([1, " 2 ", "2"]), ["1", "2"]);
});
