import assert from "node:assert/strict";
import test from "node:test";
import { CLICKADU_USD_IDR_RATE, calculateClickaduDailyFinancials } from "./financials.ts";

test("fixed FX is exactly 19000 and decimal-safe", () => {
  assert.equal(CLICKADU_USD_IDR_RATE, "19000");
  assert.deepEqual(calculateClickaduDailyFinancials("20.2542", "498581"), { spendIdr: "384829.8", profitIdr: "113751.2" });
});

test("missing sources keep derived money unknown and negative profit is preserved", () => {
  assert.deepEqual(calculateClickaduDailyFinancials(null, "10"), { spendIdr: null, profitIdr: null });
  assert.deepEqual(calculateClickaduDailyFinancials("1", null), { spendIdr: "19000", profitIdr: null });
  assert.deepEqual(calculateClickaduDailyFinancials("1", "10000"), { spendIdr: "19000", profitIdr: "-9000" });
});
