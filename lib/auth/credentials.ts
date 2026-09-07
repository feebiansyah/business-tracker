import { compare, hash } from "bcryptjs";

export const LOGIN_ERROR_MESSAGE = "Email atau password salah.";
const DUMMY_PASSWORD_HASH = "$2b$12$4d3qEvww26JzjZAePOb.B.3PkyfptoPtVWG.TfwKtG//Wm6YuQq5.";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AuthUserRecord = { id: number; email: string; name: string; isActive: boolean; passwordHash: string };
export type CurrentUser = Pick<AuthUserRecord, "id" | "email" | "name">;

export function normalizeEmail(value: string) { return value.trim().toLowerCase(); }

export function validateNewUserInput(input: { email: string; name: string; password: string }) {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  if (!EMAIL_PATTERN.test(email)) throw new Error("Email tidak valid.");
  if (!name) throw new Error("Nama wajib diisi.");
  if (input.password.length < 12) throw new Error("Password minimal 12 karakter.");
  return { email, name, password: input.password };
}

export function hashPassword(password: string) { return hash(password, 12); }
export function verifyPassword(password: string, passwordHash: string) { return compare(password, passwordHash); }

export async function authenticateCredentials(emailValue: string, password: string, deps: { findUser(email: string): Promise<AuthUserRecord | null> }): Promise<CurrentUser> {
  const user = await deps.findUser(normalizeEmail(emailValue));
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !user.isActive || !valid) throw new Error(LOGIN_ERROR_MESSAGE);
  return { id: user.id, email: user.email, name: user.name };
}
