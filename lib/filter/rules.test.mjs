import assert from "node:assert/strict";
import test from "node:test";
import { isFilterCampaign, resolveEffectiveDailyBudget } from "./rules.ts";

test("ACTIVE campaign at 199999 belongs to Filter", () => {
  assert.equal(isFilterCampaign({ status: "ACTIVE", effectiveDailyBudget: 199999 }), true);
});

test("ACTIVE campaign at 200000 does not belong to Filter", () => {
  assert.equal(isFilterCampaign({ status: "ACTIVE", effectiveDailyBudget: 200000 }), false);
});

test("PAUSED campaign at 50000 does not belong to Filter", () => {
  assert.equal(isFilterCampaign({ status: "PAUSED", effectiveDailyBudget: 50000 }), false);
});

test("campaign daily budget overrides the ad-set sum", () => {
  assert.deepEqual(resolveEffectiveDailyBudget({ daily_budget: "75000" }, [{ daily_budget: "40000" }, { daily_budget: "50000" }]), { amount: 75000, source: "CAMPAIGN" });
});

test("all ad-set daily budgets are summed including paused ad sets", () => {
  assert.deepEqual(resolveEffectiveDailyBudget({}, [{ daily_budget: "40000", status: "ACTIVE" }, { daily_budget: "50000", status: "PAUSED" }]), { amount: 90000, source: "ADSET" });
});

test("missing usable daily budgets remain unresolved and excluded", () => {
  const result = resolveEffectiveDailyBudget({ lifetime_budget: "500000" }, [{ lifetime_budget: "250000" }]);
  assert.deepEqual(result, { amount: null, source: "UNRESOLVED" });
  assert.equal(isFilterCampaign({ status: "ACTIVE", effectiveDailyBudget: result.amount }), false);
});
