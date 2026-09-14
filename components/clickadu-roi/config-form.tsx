"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteClickaduConfigAction, saveClickaduConfigAction } from "@/app/shopee/[id]/clickadu-roi/actions";
import { Button } from "@/components/ui/button";
import type { ClickaduAnalysisConfig } from "@/lib/clickadu-roi/analyze";

export function ClickaduConfigForm({ shopeeAccountId, configs }: { shopeeAccountId: number; configs: ClickaduAnalysisConfig[] }) {
  const router = useRouter(); const [editing, setEditing] = useState<ClickaduAnalysisConfig | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function save(formData: FormData) { setBusy(true); setError(""); const result = await saveClickaduConfigAction(shopeeAccountId, formData); setBusy(false); if (!result.success) setError(result.message); else { setEditing(null); router.refresh(); } }
  async function remove(id: number) { setBusy(true); const result = await deleteClickaduConfigAction(shopeeAccountId, id); setBusy(false); if (!result.success) setError(result.message); else router.refresh(); }
  return <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><div><h3 className="font-semibold text-slate-950">Konfigurasi Campaign</h3><p className="mt-1 text-sm text-slate-500">Source Tag dicocokkan ke Tag_link1 pada CSV Shopee.</p></div>
    <form key={editing?.id ?? "new"} action={save} className="grid gap-3 md:grid-cols-4"><input type="hidden" name="configId" value={editing?.id ?? ""}/><input name="campaignId" defaultValue={editing?.campaignId ?? ""} required placeholder="Campaign ID" className="h-9 rounded-lg border border-slate-200 px-3 text-sm"/><input name="label" defaultValue={editing?.label ?? ""} placeholder="Label (opsional)" className="h-9 rounded-lg border border-slate-200 px-3 text-sm"/><input name="sourceTag" defaultValue={editing?.sourceTag ?? ""} required placeholder="Source Tag / Tag_link1" className="h-9 rounded-lg border border-slate-200 px-3 text-sm"/><Button disabled={busy}>{editing ? "Simpan Perubahan" : "Tambah Config"}</Button></form>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <div className="space-y-2">{configs.map((config) => <div key={config.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3"><div><p className="font-medium text-slate-900">{config.label || config.campaignId}</p><p className="text-xs text-slate-500">{config.campaignId} · {config.sourceTag}</p></div><div><Button type="button" variant="ghost" onClick={() => setEditing(config)}>Edit</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => remove(config.id)}>Hapus</Button></div></div>)}{!configs.length && <p className="text-sm text-slate-500">Belum ada campaign Clickadu.</p>}</div>
  </section>;
}
