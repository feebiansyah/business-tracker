"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, X } from "lucide-react";
import { deleteShopeeAccountAction, renameShopeeAccountAction } from "@/app/shopee/actions";
import { Button } from "@/components/ui/button";

export function ShopeeAccountManagement({ accountId, accountName }: { accountId: number; accountName: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [editError, setEditError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [editSuccess, setEditSuccess] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const saveInFlightRef = useRef(false);
  const deleteInFlightRef = useRef(false);

  async function handleRename(formData: FormData) {
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setSaving(true);
    setEditError("");
    setEditSuccess("");
    try {
      const result = await renameShopeeAccountAction(accountId, formData);
      if (!result.success) {
        setEditError(result.message);
        return;
      }
      setEditSuccess("Nama Akun Shopee berhasil diperbarui.");
      setEditing(false);
      router.refresh();
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deleteInFlightRef.current || confirmation !== accountName) return;
    deleteInFlightRef.current = true;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      const result = await deleteShopeeAccountAction(accountId, confirmation);
      if (!result.success) {
        setDeleteError(result.message);
        return;
      }
      router.replace("/shopee");
      router.refresh();
    } finally {
      deleteInFlightRef.current = false;
      setDeleteBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" onClick={() => { setEditing((value) => !value); setEditError(""); }}>
          <Pencil className="size-4" /> Edit
        </Button>
        <Button type="button" variant="destructive" onClick={() => { setDeleting(true); setDeleteError(""); setConfirmation(""); }}>
          <Trash2 className="size-4" /> Hapus
        </Button>
      </div>

      {editing ? (
        <form action={handleRename} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:max-w-lg">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Nama Shopee Account
            <input
              name="name"
              defaultValue={accountName}
              disabled={saving}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-950 disabled:bg-slate-100"
              required
            />
          </label>
          {editError ? <p className="text-sm text-red-600" role="alert">{editError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
            <Button type="button" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>Batal</Button>
          </div>
        </form>
      ) : null}
      {editSuccess ? <p className="text-sm text-emerald-700" role="status">{editSuccess}</p> : null}

      {deleting ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleteBusy) setDeleting(false); }}>
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="delete-shopee-title">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="delete-shopee-title" className="text-lg font-semibold text-slate-950">Hapus Akun Shopee</h3>
                <p className="mt-1 text-sm text-slate-600">Tindakan ini tidak dapat dibatalkan.</p>
              </div>
              <button type="button" aria-label="Tutup" disabled={deleteBusy} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50" onClick={() => setDeleting(false)}><X className="size-5" /></button>
            </div>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-600">
              <li>WL tidak akan dihapus, hanya dilepas dari Shopee ini.</li>
              <li>Data campaign dan histori Meta tetap disimpan.</li>
              <li>Credential dan config Clickadu/Adsterra akan dihapus permanen.</li>
              <li>Akun dengan riwayat import Komisi/Klik tidak dapat dihapus.</li>
            </ul>
            <label className="mt-4 grid gap-1 text-sm font-medium text-slate-700">
              Ketik <span className="font-semibold text-slate-950">{accountName}</span> untuk konfirmasi
              <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={deleteBusy} autoComplete="off" className="h-10 rounded-md border border-slate-300 px-3 font-normal" />
            </label>
            {deleteError ? <p className="mt-3 text-sm text-red-600" role="alert">{deleteError}</p> : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" disabled={deleteBusy} onClick={() => setDeleting(false)}>Batal</Button>
              <Button type="button" variant="destructive" disabled={deleteBusy || confirmation !== accountName} onClick={handleDelete}>
                {deleteBusy ? "Menghapus..." : "Hapus Shopee"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
