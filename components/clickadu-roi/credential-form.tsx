"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteClickaduCredentialAction, saveClickaduCredentialAction } from "@/app/shopee/[id]/clickadu-roi/actions";
import { Button } from "@/components/ui/button";

export function ClickaduCredentialForm({ shopeeAccountId, shopeeAccountName, connected }: { shopeeAccountId: number; shopeeAccountName: string; connected: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(formData: FormData) {
    setBusy(true); setError("");
    const result = await saveClickaduCredentialAction(shopeeAccountId, formData);
    setBusy(false);
    if (!result.success) setError(result.message); else router.refresh();
  }
  async function disconnect() {
    setBusy(true); setError("");
    const result = await deleteClickaduCredentialAction(shopeeAccountId);
    setBusy(false);
    if (!result.success) setError(result.message); else router.refresh();
  }
  return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold text-slate-950">Koneksi Clickadu</h3><p className="mt-1 text-sm text-slate-600">Akun Shopee: <span className="font-medium text-slate-900">{shopeeAccountName}</span></p><p className="mt-0.5 text-sm text-slate-600">Status Clickadu: <span className="font-medium">{connected ? "Terhubung" : "Belum terhubung"}</span></p><p className="mt-1 text-xs text-slate-500">Token dienkripsi dan hanya digunakan di server.</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${connected ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{connected ? "Terhubung" : "Belum terhubung"}</span></div>
    <form action={save} className="flex flex-col gap-3 sm:flex-row"><label className="min-w-0 flex-1 text-sm font-medium text-slate-700">API Token Clickadu<input type="password" name="token" autoComplete="new-password" required placeholder={connected ? "Token baru (token lama tidak ditampilkan)" : "Masukkan API Token Clickadu"} className="mt-1 h-9 w-full min-w-0 rounded-lg border border-slate-200 px-3 text-sm font-normal"/></label><Button className="sm:mt-6" disabled={busy}>{connected ? "Ganti Token" : "Simpan Koneksi"}</Button></form>
    {connected && <Button type="button" variant="ghost" disabled={busy} onClick={disconnect}>Putuskan Koneksi</Button>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </section>;
}
