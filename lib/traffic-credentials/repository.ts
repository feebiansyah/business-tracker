import type { Prisma, PrismaClient, TrafficProvider } from "../generated/prisma/client.ts";

type CredentialDb = Pick<PrismaClient, "shopeeAccount" | "trafficCredential"> | Pick<Prisma.TransactionClient, "shopeeAccount" | "trafficCredential">;

export async function getEncryptedTrafficCredential(db: CredentialDb, shopeeAccountId: number, provider: TrafficProvider) {
  return db.trafficCredential.findUnique({
    where: { shopeeAccountId_provider: { shopeeAccountId, provider } },
    select: { id: true, shopeeAccountId: true, provider: true, encryptedSecret: true },
  });
}

export async function saveTrafficCredential(db: CredentialDb, shopeeAccountId: number, provider: TrafficProvider, encryptedSecret: string) {
  const account = await db.shopeeAccount.findUnique({ where: { id: shopeeAccountId }, select: { id: true } });
  if (!account) throw new Error("Akun Shopee tidak ditemukan.");
  return db.trafficCredential.upsert({
    where: { shopeeAccountId_provider: { shopeeAccountId, provider } },
    create: { shopeeAccountId, provider, encryptedSecret },
    update: { encryptedSecret },
    select: { id: true },
  });
}

export async function deleteTrafficCredential(db: CredentialDb, shopeeAccountId: number, provider: TrafficProvider) {
  const deleted = await db.trafficCredential.deleteMany({ where: { shopeeAccountId, provider } });
  return deleted.count === 1;
}
