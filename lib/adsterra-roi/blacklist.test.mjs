import assert from "node:assert/strict";
import test from "node:test";

import {
  AdsterraBlacklistError,
  buildAdsterraBlacklistTarget,
  placementSetsEqual,
  replaceAdsterraBlacklist,
} from "./blacklist.ts";
import { AdsterraAmbiguousWriteError, AdsterraApiError } from "./client.ts";

const row = (placement, costIdr, roi) => ({ placement, costIdr, roi });

test("target updates only analyzed placements with cost and preserves absent blacklist entries", () => {
  const result = buildAdsterraBlacklistTarget(
    [1, 2, 3],
    [row("1", "1000", "20"), row("2", "1000", "30"), row("4", "1000", "-1")],
  );
  assert.deepEqual(result.targetPlacementIds, [1, 3, 4]);
  assert.deepEqual(result.addedPlacementIds, [4]);
  assert.deepEqual(result.removedPlacementIds, [2]);
  assert.deepEqual(result.preservedWithoutDataPlacementIds, [3]);
});

test("cost below Rp1.000 preserves existing blacklist state and does not add a new placement", () => {
  const result = buildAdsterraBlacklistTarget(
    [1],
    [row("1", "999", "100"), row("2", "999", "-100")],
  );
  assert.deepEqual(result.targetPlacementIds, [1]);
  assert.deepEqual(result.addedPlacementIds, []);
  assert.deepEqual(result.removedPlacementIds, []);
  assert.deepEqual(result.preservedWithoutDataPlacementIds, [1]);
});

test("zero-cost rows do not change existing state and target is deduplicated", () => {
  assert.deepEqual(
    buildAdsterraBlacklistTarget([7, 7], [row("7", "0", null), row("8", "0", null)]).targetPlacementIds,
    [7],
  );
});

test("empty target remains valid and exact set comparison ignores order", () => {
  assert.deepEqual(buildAdsterraBlacklistTarget([], []).targetPlacementIds, []);
  assert.equal(placementSetsEqual([2, 1], [1, 2]), true);
  assert.equal(placementSetsEqual([1], [1, 2]), false);
  assert.equal(placementSetsEqual([1, 3], [1, 2]), false);
});

function fixture({ existing = [1, 2, 3], after = [1, 3, 4], putError } = {}) {
  const calls = [];
  return {
    calls,
    deps: {
      getBlacklist: async () => {
        calls.push("get");
        return calls.filter((call) => call === "get").length === 1 ? existing : after;
      },
      replaceBlacklist: async (_campaignId, placements) => {
        calls.push(["put", placements]);
        if (putError) throw putError;
      },
    },
  };
}

const analyzed = [row("1", "1000", "20"), row("2", "1000", "30"), row("4", "1000", "-1")];

test("replacement sends the computed integer target and verifies exact membership", async () => {
  const testFixture = fixture();
  const result = await replaceAdsterraBlacklist("1463724", analyzed, testFixture.deps);
  assert.equal(result.status, "UPDATED");
  assert.deepEqual(testFixture.calls, ["get", ["put", [1, 3, 4]], "get"]);
});

test("NO_CHANGE skips PUT", async () => {
  const testFixture = fixture({ existing: [4, 3, 1], after: [] });
  const result = await replaceAdsterraBlacklist("1463724", analyzed, testFixture.deps);
  assert.equal(result.status, "NO_CHANGE");
  assert.equal(testFixture.calls.some(Array.isArray), false);
});

test("verification fails for missing or extra placement", async () => {
  await assert.rejects(replaceAdsterraBlacklist("1463724", analyzed, fixture({ after: [1, 3] }).deps), AdsterraBlacklistError);
  await assert.rejects(replaceAdsterraBlacklist("1463724", analyzed, fixture({ after: [1, 3, 4, 9] }).deps), AdsterraBlacklistError);
});

test("ambiguous PUT is verified once without blind retry", async () => {
  const exact = fixture({ putError: new AdsterraAmbiguousWriteError() });
  assert.equal((await replaceAdsterraBlacklist("1463724", analyzed, exact.deps)).status, "UPDATED");
  assert.equal(exact.calls.filter(Array.isArray).length, 1);

  const mismatch = fixture({ putError: new AdsterraAmbiguousWriteError(), after: [1, 2, 3] });
  await assert.rejects(replaceAdsterraBlacklist("1463724", analyzed, mismatch.deps), AdsterraBlacklistError);
  assert.equal(mismatch.calls.filter(Array.isArray).length, 1);
});

test("definitive PUT HTTP errors are not treated as success", async () => {
  const testFixture = fixture({ putError: new AdsterraApiError("Request Adsterra gagal (HTTP 422).") });
  await assert.rejects(replaceAdsterraBlacklist("1463724", analyzed, testFixture.deps), /HTTP 422/);
  assert.equal(testFixture.calls.filter(Array.isArray).length, 1);
  assert.equal(testFixture.calls.filter((call) => call === "get").length, 1);
});
