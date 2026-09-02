import { Prisma } from "../generated/prisma/client.ts";
import { canonicalCommission } from "./commission.ts";
import type { MatchedCommission } from "./types.ts";
import type { PersistImportInput, ImportReceipt, UnmatchedCommission } from "./types.ts";

export type ImportTransaction = Prisma.TransactionClient;

const METRIC_CHUNK_SIZE = 500;

export const metricDuplicateUpdateColumns = Object.freeze(["commission", "updatedAt"] as const);

export function chunkValues<T>(values: readonly T[], size: number): T[][] {
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new Error("Chunk size must be a positive integer");
  }

  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export async function lockShopeeAccount(tx: ImportTransaction,id:number){const rows=await tx.$queryRaw<{id:number}[]>`SELECT id FROM shopeeaccount WHERE id = ${id} FOR UPDATE`;if(rows.length===0)throw new (await import("./errors.ts")).ShopeeImportError("SHOPEE_ACCOUNT_NOT_FOUND","Akun Shopee tidak ditemukan.")}
export async function createUnmatchedChunks(tx:ImportTransaction,importId:number,rows:readonly UnmatchedCommission[]){for(const chunk of chunkValues(rows,500))await tx.shopeeCommissionImportUnmatched.createMany({data:chunk.map(r=>({importId,date:new Date(`${r.date}T00:00:00.000Z`),tagLink2:r.tagLink2,commission:canonicalCommission(r.commission),rowCount:r.rowCount,reason:r.reason}))})}
export async function persistCommissionImportInTransaction(tx:ImportTransaction,input:PersistImportInput):Promise<ImportReceipt>{
 const history=await tx.shopeeCommissionImport.create({data:{shopeeAccountId:input.shopeeAccountId,originalFilename:input.originalFilename,fileSha256:input.fileSha256,dateFrom:new Date(`${input.dateFrom}T00:00:00.000Z`),dateTo:new Date(`${input.dateTo}T00:00:00.000Z`),csvRowCount:input.csvRowCount,tagCount:input.tagCount,matchedCount:input.matched.length,unmatchedCount:input.unmatched.length,matchedCommission:canonicalCommission(input.matchedCommission),unmatchedCommission:canonicalCommission(input.unmatchedCommission)}});
 await upsertCommissionChunks(tx,input.matched);await createUnmatchedChunks(tx,history.id,input.unmatched);
 return {importId:history.id,matchedCount:input.matched.length,unmatchedCount:input.unmatched.length,matchedCommission:canonicalCommission(input.matchedCommission),unmatchedCommission:canonicalCommission(input.unmatchedCommission),createdAt:history.createdAt.toISOString()};
}

function assertMatchedRows(matched: readonly MatchedCommission[]) {
  const keys = new Set<string>();
  for (const row of matched) {
    if ("reason" in row || !Number.isSafeInteger(row.campaignId) || row.campaignId <= 0) {
      throw new Error("Persistence accepts matched commission rows only");
    }

    const key = `${row.campaignId}:${row.date}`;
    if (keys.has(key)) {
      throw new Error("Duplicate campaign and date in matched commission batch");
    }
    keys.add(key);
  }
}

export function buildMetricUpsertQuery(chunk: readonly MatchedCommission[]) {
  const valueRows = chunk.map((row) => Prisma.sql`(
    ${row.campaignId},
    ${new Date(`${row.date}T00:00:00.000Z`)},
    ${canonicalCommission(row.commission)},
    NOW(),
    NOW()
  )`);

  return Prisma.sql`
    INSERT INTO \`campaigndailymetric\`
      (\`campaignId\`, \`date\`, \`commission\`, \`createdAt\`, \`updatedAt\`)
    VALUES ${Prisma.join(valueRows)}
    ON DUPLICATE KEY UPDATE
      \`commission\` = VALUES(\`commission\`),
      \`updatedAt\` = NOW()
  `;
}

export async function upsertCommissionChunks(
  tx: Pick<ImportTransaction, "$executeRaw">,
  matched: readonly MatchedCommission[],
) {
  assertMatchedRows(matched);

  for (const chunk of chunkValues(matched, METRIC_CHUNK_SIZE)) {
    await tx.$executeRaw(buildMetricUpsertQuery(chunk));
  }
}
