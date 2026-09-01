export type BudgetSource = "CAMPAIGN" | "ADSET" | "UNRESOLVED";

export type DailyBudgetRecord = {
  daily_budget?: string | null;
  lifetime_budget?: string | null;
  status?: string | null;
};

export type DateChunk = { since: string; until: string };
