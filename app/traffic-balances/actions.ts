"use server";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { decryptTrafficSecret } from "@/lib/traffic-credentials/crypto";
import { getEncryptedTrafficCredential } from "@/lib/traffic-credentials/repository";
import { requestTrafficBalance } from "@/lib/traffic-balances/providers";
import { loadTrafficBalances } from "@/lib/traffic-balances/service";

export async function getTrafficBalancesAction(input: unknown) {
  await requireUser();
  try {
    const balances = await loadTrafficBalances(input, {
      loadAccounts: (ids) => prisma.shopeeAccount.findMany({ where: { id: { in: ids } }, select: { id: true } }),
      loadCredential: (id, provider) => getEncryptedTrafficCredential(prisma, id, provider),
      decrypt: decryptTrafficSecret,
      requestBalance: requestTrafficBalance,
    });
    return { success: true as const, balances };
  } catch {
    return { success: false as const, message: "Saldo gagal dimuat. Silakan coba refresh kembali." };
  }
}
