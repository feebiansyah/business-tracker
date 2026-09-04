import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.ts";
import { persistMetaAccountDailySpend } from "./account-spend.ts";

const prisma = new PrismaClient();
class Rollback extends Error {}

test("daily spend upserts by WL and date while keeping WLs separate", async () => {
  await assert.rejects(prisma.$transaction(async (tx) => {
    const suffix = randomUUID();
    const a = await tx.metaAccount.create({ data: { name: "A", accountId: `spend-a-${suffix}` } });
    const b = await tx.metaAccount.create({ data: { name: "B", accountId: `spend-b-${suffix}` } });
    await persistMetaAccountDailySpend(tx, a.id, [{ date_start: "2026-09-04", date_stop: "2026-09-04", spend: "10.25" }], "2026-09-04");
    await persistMetaAccountDailySpend(tx, a.id, [{ date_start: "2026-09-04", date_stop: "2026-09-04", spend: "20.50" }], "2026-09-04");
    await persistMetaAccountDailySpend(tx, b.id, [{ date_start: "2026-09-04", date_stop: "2026-09-04", spend: "7.75" }], "2026-09-04");
    const rows = await tx.metaAccountDailySpend.findMany({ orderBy: { metaAccountId: "asc" } });
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row) => row.spend.toFixed(2)), ["20.50", "7.75"]);
    throw new Rollback();
  }), Rollback);
});

test.after(async () => prisma.$disconnect());
