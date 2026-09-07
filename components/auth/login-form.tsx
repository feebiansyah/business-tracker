"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

const initialState = { message: "" };

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);
  return <form action={action} className="space-y-5">
    <div className="space-y-2"><label htmlFor="email" className="text-sm font-medium text-slate-700">Email</label><input id="email" name="email" type="email" autoComplete="email" required className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-base text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" /></div>
    <div className="space-y-2"><label htmlFor="password" className="text-sm font-medium text-slate-700">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-base text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" /></div>
    {state.message && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.message}</p>}
    <Button type="submit" disabled={pending} className="h-11 w-full">{pending ? "Memproses..." : "Masuk"}</Button>
  </form>;
}
