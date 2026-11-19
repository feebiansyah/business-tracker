"use client";

import { useRef,useState,useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveOverviewGroupAction,deleteOverviewGroupAction } from "@/app/settings/overview-group-actions";

export type GroupFormProps = {
  accounts: { id: number; name: string; groupId: number | null }[];
  group?: { id: number; name: string; memberIds: number[] };
};
export function OverviewGroupForm({ accounts,group }: GroupFormProps) {
  const router = useRouter(), lock = useRef(false);
  const [pending,startTransition] = useTransition();
  const [result,setResult] = useState<{ success: boolean; message: string } | null>(null);
  function submit(form: HTMLFormElement,remove = false) {
    if (lock.current) return;
    if (remove && !window.confirm(`Hapus grup "${group!.name}"? Akun dan seluruh datanya tetap tersimpan.`)) return;
    lock.current = true; setResult(null);
    const data = new FormData(form);
    startTransition(async () => {
      try {
        const response = remove ? await deleteOverviewGroupAction(group!.id) : await saveOverviewGroupAction(data);
        setResult(response);
        if (response.success) { if (!group) form.reset(); router.refresh(); }
      } catch {
        setResult({ success: false,message: "Hasil penyimpanan belum dapat diperiksa. Muat ulang sebelum mencoba kembali." });
      } finally { lock.current = false; }
    });
  }
  return <form onSubmit={(event) => { event.preventDefault(); submit(event.currentTarget); }} className="min-w-0 space-y-3 rounded-lg border border-slate-200 bg-white p-3">
    {group && <input type="hidden" name="id" value={group.id} />}
    <label className="grid gap-1 text-sm font-medium text-slate-700">Nama grup
      <input name="name" defaultValue={group?.name ?? ""} required maxLength={191} disabled={pending} className="h-10 min-w-0 rounded-md border border-slate-300 px-3 font-normal" />
    </label>
    <label className="grid gap-1 text-sm font-medium text-slate-700">Akun Shopee (minimal dua)
      <select name="memberIds" multiple size={Math.min(6,Math.max(3,accounts.length))} defaultValue={group?.memberIds.map(String) ?? []} disabled={pending} className="min-w-0 w-full rounded-md border border-slate-300 bg-white p-2 font-normal">
        {accounts.map((account) => <option key={account.id} value={account.id} disabled={account.groupId !== null && account.groupId !== group?.id}>{account.name}{account.groupId !== null && account.groupId !== group?.id ? " — anggota grup lain" : ""}</option>)}
      </select>
    </label>
    <p className="text-xs text-slate-500">Grup hanya menggabungkan laporan. Sync, import, serta seluruh data akun tetap terpisah. Gunakan Ctrl/Cmd untuk memilih beberapa akun pada desktop.</p>
    <div className="flex flex-wrap gap-2">
      <button disabled={pending} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{pending ? "Memproses…" : group ? "Simpan" : "Buat grup"}</button>
      {group && <button type="button" disabled={pending} onClick={(event) => submit(event.currentTarget.form!,true)} className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-700 disabled:opacity-50">Hapus grup</button>}
    </div>
    {result && <p role={result.success ? "status" : "alert"} className={`break-words text-sm ${result.success ? "text-emerald-700" : "text-red-700"}`}>{result.message}</p>}
  </form>;
}
