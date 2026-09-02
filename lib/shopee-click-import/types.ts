import type { CampaignCandidate, PreviewConfirmation, UnmatchedReason } from "../shopee-import/types.ts";

export type ClickRow = { logicalRow: number; date: string; tagLink2: string; normalizedTagLink2: string };
export type ParsedClickCsv = { rows: ClickRow[]; csvRowCount: number; processedRowCount: number; ignoredRowCount: number };
export type ClickAggregate = { date: string; tagLink2: string; normalizedTagLink2: string; clickCount: number };
export type ClickAggregation = ParsedClickCsv & { aggregates: ClickAggregate[]; groupCount: number; dateFrom: string; dateTo: string };
export type MatchedClick = ClickAggregate & { campaignId: number };
export type UnmatchedClick = ClickAggregate & { reason: UnmatchedReason };
export type ClickMatch = { matched: MatchedClick[]; unmatched: UnmatchedClick[]; matchedClicks: number; unmatchedClicks: number };
export type ClickPreview = {
  originalFilename: string; fileSha256: string; matchDigest: string; confirmation: PreviewConfirmation;
  dateFrom: string; dateTo: string; csvRowCount: number; processedRowCount: number; ignoredRowCount: number; groupCount: number;
  matchedCount: number; unmatchedCount: number; matchedClicks: number; unmatchedClicks: number;
  unmatched: Array<{ date: string; tagLink2: string; clickCount: number; reason: UnmatchedReason }>;
};
export type ClickPreviewDeps = { accountExists(id: number): Promise<boolean>; loadCampaigns(id: number): Promise<CampaignCandidate[]> };
export type PersistClickInput = ClickAggregation & ClickMatch & { shopeeAccountId: number; originalFilename: string; fileSha256: string };
export type ClickImportReceipt = { importId: number; matchedCount: number; unmatchedCount: number; matchedClicks: number; unmatchedClicks: number; createdAt: string };
export type ClickHistoryRow = { id: number; originalFilename: string; dateFrom: string; dateTo: string; csvRowCount: number; processedRowCount: number; ignoredRowCount: number; groupCount: number; matchedCount: number; unmatchedCount: number; matchedClicks: number; unmatchedClicks: number; createdAt: string };
