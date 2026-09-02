import { aggregateCommissionRows } from "./aggregate.ts";
import { decodeAndParseCsv } from "./csv.ts";
import { ShopeeImportError } from "./errors.ts";
import { buildMatchDigest, sha256 } from "./fingerprint.ts";
import { matchCommissionAggregates } from "./matching.ts";
import { sanitizeFilename, validateShopeeAccountId } from "./upload.ts";
import type {
  CampaignCandidate,
  PreviewDeps,
  ShopeeCommissionPreview,
} from "./types.ts";

export type PreviewInput = {
  shopeeAccountId: number;
  originalFilename: string;
  bytes: Uint8Array;
};

export async function buildShopeeCommissionPreview(
  input: PreviewInput,
  deps: PreviewDeps,
): Promise<ShopeeCommissionPreview> {
  validateShopeeAccountId(input.shopeeAccountId);
  if (!(await deps.accountExists(input.shopeeAccountId))) {
    throw new ShopeeImportError("SHOPEE_ACCOUNT_NOT_FOUND", "Akun Shopee tidak ditemukan.");
  }

  const originalFilename = sanitizeFilename(input.originalFilename);
  const aggregation = aggregateCommissionRows(decodeAndParseCsv(input.bytes));
  const campaigns: CampaignCandidate[] = await deps.loadCampaigns(input.shopeeAccountId);
  const match = matchCommissionAggregates(aggregation.aggregates, campaigns);
  const fileSha256 = sha256(input.bytes);
  const matchDigest = buildMatchDigest(input.shopeeAccountId, { ...aggregation, ...match });

  return {
    originalFilename,
    fileSha256,
    matchDigest,
    confirmation: { fileSha256, matchDigest },
    dateFrom: aggregation.dateFrom,
    dateTo: aggregation.dateTo,
    csvRowCount: aggregation.csvRowCount,
    tagCount: aggregation.tagCount,
    matchedCount: match.matched.length,
    unmatchedCount: match.unmatched.length,
    matchedCommission: match.matchedCommission.toFixed(2),
    unmatchedCommission: match.unmatchedCommission.toFixed(2),
    unmatched: match.unmatched.map((row) => ({
      date: row.date,
      tagLink2: row.tagLink2,
      commission: row.commission.toFixed(2),
      rowCount: row.rowCount,
      reason: row.reason,
    })),
  };
}
