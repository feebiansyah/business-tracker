import { createHash } from "node:crypto";
import { canonicalCommission } from "./commission.ts";
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
      commission: canonicalCommission(row.commission),
      rowCount: row.rowCount,
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const unmatched = result.unmatched
    .map((row) => ({
      date: row.date,
      tagLink2: row.tagLink2,
      normalizedTagLink2: row.normalizedTagLink2,
      commission: canonicalCommission(row.commission),
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
      matchedCommission: canonicalCommission(result.matchedCommission),
      unmatchedCommission: canonicalCommission(result.unmatchedCommission),
      matched,
      unmatched,
    }),
  );
}
