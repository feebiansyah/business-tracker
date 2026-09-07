import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/auth/session";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return <main className="flex min-h-screen items-center justify-center bg-[#f6f8fb] px-4 py-10 sm:px-6"><section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><div className="mb-7 flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-blue-600 text-xs font-bold tracking-wide text-white">BT</div><div><h1 className="text-xl font-semibold tracking-tight text-slate-950">Business Tracker</h1><p className="text-sm text-slate-500">Masuk untuk melanjutkan</p></div></div><LoginForm /></section></main>;
}
