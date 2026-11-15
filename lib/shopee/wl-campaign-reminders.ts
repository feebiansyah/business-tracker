import type { PrismaClient } from "@/lib/generated/prisma/client";

type Reminder = { message: string; hint?: string };

/** Stored evidence only: a parent run being COMPLETE is not proof for a WL. */
export async function getWlCampaignReminders(db: Pick<PrismaClient, "$queryRaw">, shopeeAccountId: number) {
  const rows = await db.$queryRaw<{ id: number; campaignCount: bigint | number; syncSucceeded: bigint | number }[]>`
    SELECT w.id, COUNT(c.id) AS campaignCount,
      EXISTS (
        SELECT 1 FROM MetaSyncWlProgress p
        INNER JOIN MetaSyncRun r ON r.id = p.runId
        WHERE p.metaAccountId = w.id AND p.accountId = w.accountId
          AND r.shopeeAccountId = w.shopeeAccountId
          AND p.status = 'SUCCEEDED' AND p.phase = 'DONE' AND p.error IS NULL
      ) AS syncSucceeded
    FROM MetaAccount w
    LEFT JOIN Campaign c ON c.metaAccountId = w.id
    WHERE w.shopeeAccountId = ${shopeeAccountId}
    GROUP BY w.id, w.accountId, w.shopeeAccountId
    HAVING SUM(CASE WHEN c.metaStatus = 'ACTIVE' THEN 1 ELSE 0 END) = 0
  `;
  return new Map<number, Reminder>(rows.map((row) => [row.id,
    Number(row.campaignCount) > 0
      ? { message: "Tidak ada campaign aktif pada data tersimpan." }
      : Number(row.syncSucceeded) === 1
        ? { message: "Sync selesai, tidak ada campaign tersimpan." }
        : { message: "Belum terverifikasi melalui Sync Meta", hint: "Jalankan Sync Meta untuk memuat campaign WL baru." },
  ]));
}
