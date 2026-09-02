import { createHash } from "node:crypto";
import type { MatchDigestInput } from "./types.ts";

function hash(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256(bytes: Uint8Array) {
  return hash(bytes);
}

export function buildMatchDigest(shopeeAccountId: number, result: MatchDigestInput) {
  const matched = result.matched
    .map((row) => ({
      campaignId: row.campaignId,
      date: row.date,
      commission: row.commission.toFixed(2),
      rowCount: row.rowCount,
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const unmatched = result.unmatched
    .map((row) => ({
      date: row.date,
      tagLink2: row.tagLink2,
      normalizedTagLink2: row.normalizedTagLink2,
      commission: row.commission.toFixed(2),
      rowCount: row.rowCount,
      reason: row.reason,
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

  return hash(
    JSON.stringify({
      shopeeAccountId,
      dateFrom: result.dateFrom,
      dateTo: result.dateTo,
      csvRowCount: result.csvRowCount,
      tagCount: result.tagCount,
      matchedCount: matched.length,
      unmatchedCount: unmatched.length,
      matchedCommission: result.matchedCommission.toFixed(2),
      unmatchedCommission: result.unmatchedCommission.toFixed(2),
      matched,
      unmatched,
    }),
  );
}
