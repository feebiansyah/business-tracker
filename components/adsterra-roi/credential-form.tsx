"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteAdsterraCredentialAction, saveAdsterraCredentialAction } from "@/app/shopee/[id]/adsterra-roi/actions";

export function AdsterraCredentialForm({ shopeeAccountId, shopeeAccountName, connected }: { shopeeAccountId: number; shopeeAccountName: string; connected: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(data: FormData) { setBusy(true); setError(""); const result = await saveAdsterraCredentialAction(shopeeAccountId, data); setBusy(false); if (result.success) router.refresh(); else setError(result.message); }
  async function disconnect() { setBusy(true); setError(""); const result = await deleteAdsterraCredentialAction(shopeeAccountId); setBusy(false); if (result.success) router.refresh(); else setError(result.message); }
  return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">Koneksi Adsterra</h3><p className="text-sm text-slate-500">Credential dienkripsi dan hanya digunakan server-side. API Key lama tidak pernah ditampilkan.</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${connected ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{connected ? "Terhubung" : "Belum terhubung"}</span></div>
    <div className="grid gap-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-2"><p>Akun Shopee: <b>{shopeeAccountName}</b></p><p>Status Adsterra: <b>{connected ? "Terhubung" : "Belum terhubung"}</b></p></div>
    <form action={save} className="flex flex-col gap-3 sm:flex-row"><label className="flex-1 text-sm font-medium">API Key Adsterra<input type="password" name="apiKey" required autoComplete="new-password" disabled={busy} placeholder={connected ? "API Key baru (API Key lama tidak ditampilkan)" : "Masukkan API Key Adsterra"} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3"/></label><Button className="sm:mt-6" disabled={busy}>{connected ? "Ganti API Key" : "Simpan Koneksi"}</Button></form>
    {connected && <Button type="button" variant="ghost" disabled={busy} onClick={disconnect}>Putuskan Koneksi</Button>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </section>;
}
