import { timingSafeEqual } from "node:crypto";
import { isTransientImportError, validatePreviewConfirmation } from "../shopee-import/importer.ts";
import { sanitizeFilename, validateShopeeAccountId } from "../shopee-import/upload.ts";
import type { CampaignCandidate, PreviewConfirmation } from "../shopee-import/types.ts";
import type { ImportTransaction } from "../shopee-import/persistence.ts";
import { ShopeeImportError } from "../shopee-import/errors.ts";
import { aggregateShopeeClicks } from "./aggregate.ts";
import { parseShopeeClickCsv } from "./csv.ts";
import { buildClickMatchDigest, clickSha256 } from "./fingerprint.ts";
import { matchClickAggregates } from "./matching.ts";
import type { ClickImportReceipt, PersistClickInput } from "./types.ts";

type Deps = { withTransaction<T>(work: (tx: ImportTransaction) => Promise<T>): Promise<T>; lockAccount(tx: ImportTransaction, id: number): Promise<void>; loadCampaigns(tx: ImportTransaction, id: number): Promise<CampaignCandidate[]>; persist(tx: ImportTransaction, input: PersistClickInput): Promise<ClickImportReceipt> };
const equal = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function importShopeeClicks(input: { shopeeAccountId: number; originalFilename: string; bytes: Uint8Array; confirmation: PreviewConfirmation }, deps: Deps) {
  validateShopeeAccountId(input.shopeeAccountId); validatePreviewConfirmation(input.confirmation);
  const originalFilename = sanitizeFilename(input.originalFilename); const fileSha256 = clickSha256(input.bytes);
  if (!equal(fileSha256, input.confirmation.fileSha256)) throw new ShopeeImportError("FILE_CHANGED", "File berubah sejak preview.");
  const aggregation = aggregateShopeeClicks(parseShopeeClickCsv(input.bytes));
  for (let attempt = 0;; attempt += 1) {
    try { return await deps.withTransaction(async (tx) => { await deps.lockAccount(tx, input.shopeeAccountId); const match = matchClickAggregates(aggregation.aggregates, await deps.loadCampaigns(tx, input.shopeeAccountId)); const digest = buildClickMatchDigest(input.shopeeAccountId, { ...aggregation, ...match }); if (!equal(digest, input.confirmation.matchDigest)) throw new ShopeeImportError("PREVIEW_STALE", "Preview sudah tidak berlaku."); return deps.persist(tx, { ...aggregation, ...match, shopeeAccountId: input.shopeeAccountId, originalFilename, fileSha256 }); }); }
    catch (error) { if (attempt >= 2 || !isTransientImportError(error)) throw error; }
  }
}
