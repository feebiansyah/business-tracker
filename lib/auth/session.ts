import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSessionToken, hashSessionToken, resolveSessionUser, revokeSession, sessionExpiry, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "./session-core";

const cookieOptions = (expires: Date) => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", expires, maxAge: SESSION_MAX_AGE_SECONDS });

export async function createUserSession(userId: number) {
  const token = createSessionToken();
  const expiresAt = sessionExpiry();
  await prisma.session.create({ data: { userId, tokenHash: hashSessionToken(token), expiresAt } });
  (await cookies()).set(SESSION_COOKIE_NAME, token, cookieOptions(expiresAt));
}

export async function getCurrentUser(options: { readOnly?: boolean } = {}) {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return resolveSessionUser(token, new Date(), {
    findSession: (tokenHash) => prisma.session.findUnique({ where: { tokenHash }, select: { tokenHash: true, expiresAt: true, user: { select: { id: true, email: true, name: true, isActive: true } } } }),
    deleteSession: async (tokenHash) => { if (!options.readOnly) await prisma.session.deleteMany({ where: { tokenHash } }); },
  });
}

export async function requireUser(options: { readOnly?: boolean } = {}) {
  const user = await getCurrentUser(options);
  if (!user) redirect("/login");
  return user;
}

export async function deleteCurrentSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (token) await revokeSession(token, { deleteSession: async (tokenHash) => { await prisma.session.deleteMany({ where: { tokenHash } }); } });
  store.set(SESSION_COOKIE_NAME, "", { ...cookieOptions(new Date(0)), maxAge: 0 });
}
