import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import "dotenv/config";
import { PrismaClient, TrafficProvider } from "../generated/prisma/client.ts";
import { deleteTrafficCredential, getEncryptedTrafficCredential, saveTrafficCredential } from "./repository.ts";

const prisma = new PrismaClient();
class Rollback extends Error {}

test("credentials are unique and strictly scoped by Shopee and provider", async () => {
  await assert.rejects(prisma.$transaction(async (tx) => {
    const suffix = randomUUID();
    const a = await tx.shopeeAccount.create({ data: { name: "Credential A", shopId: `cred-a-${suffix}` } });
    const b = await tx.shopeeAccount.create({ data: { name: "Credential B", shopId: `cred-b-${suffix}` } });
    await saveTrafficCredential(tx, a.id, TrafficProvider.CLICKADU, "cipher-a");
    await saveTrafficCredential(tx, a.id, TrafficProvider.CLICKADU, "cipher-a-new");
    await saveTrafficCredential(tx, b.id, TrafficProvider.CLICKADU, "cipher-b");
    assert.equal((await getEncryptedTrafficCredential(tx, a.id, TrafficProvider.CLICKADU))?.encryptedSecret, "cipher-a-new");
    assert.equal(await tx.trafficCredential.count({ where: { shopeeAccountId: a.id, provider: TrafficProvider.CLICKADU } }), 1);
    assert.equal(await deleteTrafficCredential(tx, a.id, TrafficProvider.CLICKADU), true);
    assert.equal((await getEncryptedTrafficCredential(tx, b.id, TrafficProvider.CLICKADU))?.encryptedSecret, "cipher-b");
    throw new Rollback();
  }), Rollback);
});

test.after(async () => prisma.$disconnect());
