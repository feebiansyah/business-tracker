import type Decimal from "decimal.js";

export type CsvRecord = {
  logicalRow: number;
  orderedAt: string;
  tagLink2: string;
  commission: string;
};

export type ParsedCommissionRow = {
  logicalRow: number;
  date: string;
  tagLink2: string;
  normalizedTagLink2: string;
  commission: Decimal;
};
