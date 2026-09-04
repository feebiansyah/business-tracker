import { Prisma } from "../generated/prisma/client.ts";
import type { MetaAccountDailySpend } from "../meta/types.ts";

type SpendDb = Pick<Prisma.TransactionClient, "metaAccountDailySpend" | "metaAccount">;
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

export async function persistMetaAccountDailySpend(db: SpendDb, metaAccountId: number, rows: MetaAccountDailySpend[], syncedThrough: string) {
    for (const row of rows) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date_start) || row.spend === undefined) continue;
      const spend = new Prisma.Decimal(row.spend);
      await db.metaAccountDailySpend.upsert({
        where: { metaAccountId_date: { metaAccountId, date: date(row.date_start) } },
        create: { metaAccountId, date: date(row.date_start), spend },
        update: { spend },
      });
    }
    await db.metaAccount.update({ where: { id: metaAccountId }, data: { spendHistorySyncedThrough: date(syncedThrough) } });
}
