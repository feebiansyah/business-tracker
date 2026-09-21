import { Prisma } from "../generated/prisma/client.ts";
import { canonicalCommission } from "./commission.ts";
import type { ImportTransaction } from "./persistence.ts";
import type { ClickaduCommissionAggregate } from "./types.ts";

const CHUNK_SIZE = 500;
export const clickaduMetricDuplicateUpdateColumns = Object.freeze(["commissionIdr", "updatedAt"] as const);

export function buildClickaduCommissionUpsertQuery(rows: readonly ClickaduCommissionAggregate[]) {
  const values = rows.map((row) => Prisma.sql`(
    ${row.clickaduCampaignConfigId},
    ${new Date(`${row.date}T00:00:00.000Z`)},
    ${canonicalCommission(row.commission)},
    NOW(),
    NOW()
  )`);
  return Prisma.sql`
    INSERT INTO \`ClickaduCampaignDailyMetric\`
      (\`clickaduCampaignConfigId\`, \`date\`, \`commissionIdr\`, \`createdAt\`, \`updatedAt\`)
    VALUES ${Prisma.join(values)}
    ON DUPLICATE KEY UPDATE
      \`commissionIdr\` = VALUES(\`commissionIdr\`),
      \`updatedAt\` = NOW()
  `;
}

export async function upsertClickaduCommissionChunks(
  tx: Pick<ImportTransaction, "$executeRaw">,
  rows: readonly ClickaduCommissionAggregate[],
) {
  for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
    const chunk = rows.slice(index, index + CHUNK_SIZE);
    await tx.$executeRaw(buildClickaduCommissionUpsertQuery(chunk));
  }
}
