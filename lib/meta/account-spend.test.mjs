import assert from "node:assert/strict";
import test from "node:test";
import { accountDailySpendRequest } from "./campaign-requests.ts";

test("account daily spend request uses account level and daily increments", () => {
  const request = accountDailySpendRequest("123", { since: "2026-08-01", until: "2026-08-31" });
  assert.equal(request.path, "/act_123/insights");
  assert.deepEqual(request.fields, ["spend", "date_start", "date_stop"]);
  assert.equal(request.params.level, "account");
  assert.equal(request.params.time_increment, "1");
});
