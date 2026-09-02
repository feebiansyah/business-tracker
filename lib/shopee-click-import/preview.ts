import { aggregateShopeeClicks } from "./aggregate.ts";
import { parseShopeeClickCsv } from "./csv.ts";
import { buildClickMatchDigest, clickSha256 } from "./fingerprint.ts";
import { matchClickAggregates } from "./matching.ts";
import { ShopeeImportError } from "../shopee-import/errors.ts";
import { sanitizeFilename, validateShopeeAccountId } from "../shopee-import/upload.ts";
import type { ClickPreview, ClickPreviewDeps } from "./types.ts";

export async function buildShopeeClickPreview(input: { shopeeAccountId: number; originalFilename: string; bytes: Uint8Array }, deps: ClickPreviewDeps): Promise<ClickPreview> {
  validateShopeeAccountId(input.shopeeAccountId);
  if (!(await deps.accountExists(input.shopeeAccountId))) throw new ShopeeImportError("SHOPEE_ACCOUNT_NOT_FOUND", "Akun Shopee tidak ditemukan.");
  const originalFilename = sanitizeFilename(input.originalFilename);
  const aggregation = aggregateShopeeClicks(parseShopeeClickCsv(input.bytes));
  const match = matchClickAggregates(aggregation.aggregates, await deps.loadCampaigns(input.shopeeAccountId));
  const fileSha256 = clickSha256(input.bytes);
  const matchDigest = buildClickMatchDigest(input.shopeeAccountId, { ...aggregation, ...match });
  return { originalFilename, fileSha256, matchDigest, confirmation: { fileSha256, matchDigest }, dateFrom: aggregation.dateFrom, dateTo: aggregation.dateTo, csvRowCount: aggregation.csvRowCount, processedRowCount: aggregation.processedRowCount, ignoredRowCount: aggregation.ignoredRowCount, groupCount: aggregation.groupCount, matchedCount: match.matched.length, unmatchedCount: match.unmatched.length, matchedClicks: match.matchedClicks, unmatchedClicks: match.unmatchedClicks, unmatched: match.unmatched.map(({ date, tagLink2, clickCount, reason }) => ({ date, tagLink2, clickCount, reason })) };
}
