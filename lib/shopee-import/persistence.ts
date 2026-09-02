import { Prisma } from "../generated/prisma/client.ts";
import { canonicalCommission } from "./commission.ts";
import type { MatchedCommission } from "./types.ts";

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
