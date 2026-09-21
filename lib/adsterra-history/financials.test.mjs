import assert from "node:assert/strict";
import test from "node:test";
import { ADSTERRA_USD_IDR_RATE, calculateAdsterraDailyFinancials } from "./financials.ts";

test("Adsterra daily financials use exact fixed 19000 rate", () => {
  assert.equal(ADSTERRA_USD_IDR_RATE, "19000");
  assert.deepEqual(calculateAdsterraDailyFinancials("20.2542", "498581"), { spendIdr: "384829.8", profitIdr: "113751.2" });
  assert.deepEqual(calculateAdsterraDailyFinancials("2", "1000"), { spendIdr: "38000", profitIdr: "-37000" });
  assert.deepEqual(calculateAdsterraDailyFinancials(null, "100"), { spendIdr: null, profitIdr: null });
  assert.deepEqual(calculateAdsterraDailyFinancials("1", null), { spendIdr: "19000", profitIdr: null });
});
