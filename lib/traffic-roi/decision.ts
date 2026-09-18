import Decimal from "decimal.js";

export const MINIMUM_DECISION_COST_IDR = new Decimal(1000);
export const BLACKLIST_ROI_THRESHOLD = new Decimal(30);

export function hasMinimumDecisionCost(costIdr: Decimal.Value) {
  return new Decimal(costIdr).greaterThanOrEqualTo(MINIMUM_DECISION_COST_IDR);
}
