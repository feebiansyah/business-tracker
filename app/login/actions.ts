"use server";

import { redirect } from "next/navigation";
import { authenticateCredentials, LOGIN_ERROR_MESSAGE } from "@/lib/auth/credentials";
import { createUserSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export type LoginActionState = { message: string };

export async function loginAction(_previousState: LoginActionState, formData: FormData): Promise<LoginActionState> {
  const email = formData.get("email");
  const password = formData.get("password");
  if (typeof email !== "string" || typeof password !== "string") return { message: LOGIN_ERROR_MESSAGE };

  let user;
  try {
    user = await authenticateCredentials(email, password, {
      findUser: (normalizedEmail) => prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, email: true, name: true, isActive: true, passwordHash: true },
      }),
    });
  } catch {
    return { message: LOGIN_ERROR_MESSAGE };
  }

  await createUserSession(user.id);
  redirect("/");
}
