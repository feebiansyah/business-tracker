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

export type CommissionAggregate = {
  date: string;
  tagLink2: string;
  normalizedTagLink2: string;
  commission: Decimal;
  rowCount: number;
};

export type AggregationResult = {
  aggregates: CommissionAggregate[];
  csvRowCount: number;
  tagCount: number;
  dateFrom: string;
  dateTo: string;
  totalCommission: Decimal;
};

export type CampaignCandidate = { id: number; name: string };
export type UnmatchedReason = "CAMPAIGN_NOT_FOUND" | "AMBIGUOUS_CAMPAIGN_NAME";
export type MatchedCommission = CommissionAggregate & { campaignId: number };
export type UnmatchedCommission = CommissionAggregate & { reason: UnmatchedReason };
export type MatchResult = {
  matched: MatchedCommission[];
  unmatched: UnmatchedCommission[];
  matchedCommission: Decimal;
  unmatchedCommission: Decimal;
};

export type MatchDigestInput = MatchResult & {
  dateFrom: string;
  dateTo: string;
  csvRowCount: number;
  tagCount: number;
};

export type PreviewConfirmation = { fileSha256: string; matchDigest: string };
export type SerializableUnmatched = {
  date: string;
  tagLink2: string;
  commission: string;
  rowCount: number;
  reason: UnmatchedReason;
};
export type ShopeeCommissionPreview = {
  originalFilename: string;
  fileSha256: string;
  matchDigest: string;
  confirmation: PreviewConfirmation;
  dateFrom: string;
  dateTo: string;
  csvRowCount: number;
  tagCount: number;
  matchedCount: number;
  unmatchedCount: number;
  matchedCommission: string;
  unmatchedCommission: string;
  unmatched: SerializableUnmatched[];
};
export type PreviewDeps = {
  accountExists(shopeeAccountId: number): Promise<boolean>;
  loadCampaigns(shopeeAccountId: number): Promise<CampaignCandidate[]>;
};
export type CsvUpload = { originalFilename: string; bytes: Uint8Array };
export type PreviewActionResult =
  | { success: true; preview: ShopeeCommissionPreview }
  | { success: false; message: string };
export type PersistImportInput = MatchResult & { shopeeAccountId:number; originalFilename:string; fileSha256:string; dateFrom:string; dateTo:string; csvRowCount:number; tagCount:number };
export type ImportReceipt = { importId:number; matchedCount:number; unmatchedCount:number; matchedCommission:string; unmatchedCommission:string; createdAt:string };
