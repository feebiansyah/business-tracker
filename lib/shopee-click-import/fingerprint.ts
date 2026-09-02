import { createHash } from "node:crypto";
import type { ClickAggregation, ClickMatch } from "./types.ts";

export const clickSha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export function buildClickMatchDigest(accountId: number, result: ClickAggregation & ClickMatch) {
  const matched = result.matched.map(({ campaignId, date, clickCount }) => ({ campaignId, date, clickCount })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const unmatched = result.unmatched.map(({ date, normalizedTagLink2, clickCount, reason }) => ({ date, normalizedTagLink2, clickCount, reason })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return createHash("sha256").update(JSON.stringify({ accountId, dateFrom: result.dateFrom, dateTo: result.dateTo, csvRowCount: result.csvRowCount, processedRowCount: result.processedRowCount, ignoredRowCount: result.ignoredRowCount, matched, unmatched })).digest("hex");
}
