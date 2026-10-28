"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveSessionUser, SESSION_COOKIE_NAME } from "@/lib/auth/session-core";
import { prisma } from "@/lib/prisma";
import { decryptTrafficSecret } from "@/lib/traffic-credentials/crypto";
import { getEncryptedTrafficCredential } from "@/lib/traffic-credentials/repository";
import { loadAdsterraPlacementLists } from "@/lib/adsterra-roi/placement-lists";
import type { PlacementListsResult } from "@/lib/adsterra-roi/placement-list-types";

export async function getAdsterraPlacementListsAction(shopeeAccountId: unknown): Promise<PlacementListsResult> {
  const deadlineAt = Date.now() + 45_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  // Bound waiting as well as HTTP. An in-flight SELECT is not cancelled by this.
  async function withinBudget<T>(operation: () => Promise<T>): Promise<T> {
    controller.signal.throwIfAborted();
    return new Promise<T>((resolve, reject) => {
      const abort = () => reject(new Error("READ_DEADLINE"));
      controller.signal.addEventListener("abort", abort, { once: true });
      Promise.resolve().then(() => { controller.signal.throwIfAborted(); return operation(); })
        .then(resolve, reject).finally(() => controller.signal.removeEventListener("abort", abort));
    });
  }
  try {
    // Same session validator and redirect as existing auth. Supply SELECT-only
    // dependencies so expired-session cleanup cannot write from this read action.
    let user: Awaited<ReturnType<typeof resolveSessionUser>>;
    try { user = await withinBudget(async () => {
      const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
      if (!token) return null;
      return resolveSessionUser(token, new Date(), {
        findSession: (tokenHash) => {
          controller.signal.throwIfAborted();
          return prisma.session.findUnique({ where: { tokenHash }, select: {
            tokenHash: true, expiresAt: true, user: { select: { id: true, email: true, name: true, isActive: true } },
          } });
        },
        deleteSession: async () => { /* Reject expired sessions, without cleanup writes. */ },
      });
    }); } catch {
      return { success: false, message: "Sesi belum dapat diverifikasi. Silakan coba kembali." };
    }
    if (!user) redirect("/login");
    try {
      const lists = await withinBudget(() => loadAdsterraPlacementLists(shopeeAccountId, {
        loadConfigs: async (accountId) => {
          const account = await prisma.shopeeAccount.findUnique({ where: { id: accountId }, select: { id: true } });
          controller.signal.throwIfAborted();
          if (!account) throw new Error("ACCOUNT_NOT_FOUND");
          return prisma.adsterraCampaignConfig.findMany({ where: { shopeeAccountId: accountId },
            select: { id: true, shopeeAccountId: true, campaignId: true }, orderBy: { id: "asc" } });
        },
        loadCredential: (accountId) => getEncryptedTrafficCredential(prisma, accountId, "ADSTERRA"),
        decrypt: decryptTrafficSecret,
      }, controller.signal, deadlineAt));
      return { success: true, lists };
    } catch {
      return { success: false, message: controller.signal.aborted
        ? "Batas waktu pembacaan daftar API tercapai. Silakan refresh."
        : "Daftar API gagal dimuat. Periksa akun dan koneksi Adsterra." };
    }
  } finally { clearTimeout(timer); }
}
