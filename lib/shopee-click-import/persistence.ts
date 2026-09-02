import { Prisma } from "../generated/prisma/client.ts";
import type { ImportTransaction } from "../shopee-import/persistence.ts";
import type { ClickImportReceipt, MatchedClick, PersistClickInput } from "./types.ts";

const CLICK_CHUNK_SIZE = 500;
export const clickDuplicateUpdateColumns = Object.freeze(["shopeeClicks", "updatedAt"] as const);

export function assertClickOnlyUpdateColumns(columns: readonly string[]) {
  if (columns.length !== 2 || columns[0] !== "shopeeClicks" || columns[1] !== "updatedAt") throw new Error("Shopee click upsert must remain click-only");
}

function chunks<T>(values: readonly T[], size: number) { const result: T[][] = []; for (let i = 0; i < values.length; i += size) result.push(values.slice(i, i + size)); return result; }
function assertMatched(rows: readonly MatchedClick[]) { const keys = new Set<string>(); for (const row of rows) { const key = `${row.campaignId}:${row.date}`; if (keys.has(key)) throw new Error("Duplicate campaign and date in click batch"); keys.add(key); } }

export function buildClickUpsertQuery(rows: readonly MatchedClick[]) {
  const values = rows.map((row) => Prisma.sql`(${row.campaignId}, ${new Date(`${row.date}T00:00:00.000Z`)}, ${row.clickCount}, NOW(), NOW())`);
  return Prisma.sql`INSERT INTO \`CampaignDailyMetric\` (\`campaignId\`, \`date\`, \`shopeeClicks\`, \`createdAt\`, \`updatedAt\`) VALUES ${Prisma.join(values)} ON DUPLICATE KEY UPDATE \`shopeeClicks\` = VALUES(\`shopeeClicks\`), \`updatedAt\` = NOW()`;
}

export async function upsertClickChunks(tx: Pick<ImportTransaction, "$executeRaw">, rows: readonly MatchedClick[]) {
  assertMatched(rows);
  for (const chunk of chunks(rows, CLICK_CHUNK_SIZE)) { assertClickOnlyUpdateColumns(clickDuplicateUpdateColumns); await tx.$executeRaw(buildClickUpsertQuery(chunk)); }
}

export async function persistClickImportInTransaction(tx: ImportTransaction, input: PersistClickInput): Promise<ClickImportReceipt> {
  const history = await tx.shopeeClickImport.create({ data: { shopeeAccountId: input.shopeeAccountId, originalFilename: input.originalFilename, fileSha256: input.fileSha256, dateFrom: new Date(`${input.dateFrom}T00:00:00.000Z`), dateTo: new Date(`${input.dateTo}T00:00:00.000Z`), csvRowCount: input.csvRowCount, processedRowCount: input.processedRowCount, ignoredRowCount: input.ignoredRowCount, groupCount: input.groupCount, matchedCount: input.matched.length, unmatchedCount: input.unmatched.length, matchedClicks: input.matchedClicks, unmatchedClicks: input.unmatchedClicks } });
  await upsertClickChunks(tx, input.matched);
  for (const chunk of chunks(input.unmatched, CLICK_CHUNK_SIZE)) await tx.shopeeClickImportUnmatched.createMany({ data: chunk.map((row) => ({ importId: history.id, date: new Date(`${row.date}T00:00:00.000Z`), tagLink2: row.tagLink2, clickCount: row.clickCount, reason: row.reason })) });
  return { importId: history.id, matchedCount: input.matched.length, unmatchedCount: input.unmatched.length, matchedClicks: input.matchedClicks, unmatchedClicks: input.unmatchedClicks, createdAt: history.createdAt.toISOString() };
}
