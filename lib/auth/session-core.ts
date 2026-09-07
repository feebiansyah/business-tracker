import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE_NAME = "bt_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export function createSessionToken() { return randomBytes(32).toString("base64url"); }
export function hashSessionToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function sessionExpiry(now = new Date()) { return new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000); }
export async function revokeSession(token: string, deps: { deleteSession(tokenHash: string): Promise<void> }) { await deps.deleteSession(hashSessionToken(token)); }

type SessionRecord = { tokenHash: string; expiresAt: Date; user: { id: number; email: string; name: string; isActive: boolean } };
export async function resolveSessionUser(token: string, now: Date, deps: { findSession(tokenHash: string): Promise<SessionRecord | null>; deleteSession(tokenHash: string): Promise<void> }) {
  const tokenHash = hashSessionToken(token);
  const session = await deps.findSession(tokenHash);
  if (!session) return null;
  if (session.expiresAt <= now) {
    await deps.deleteSession(tokenHash);
    return null;
  }
  if (!session.user.isActive) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}
