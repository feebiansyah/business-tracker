"use client";

import { useActionState } from "react";
import Link from "next/link";
import { updateMetaAccountShopeeConnection } from "@/app/shopee/actions";
import { Button } from "@/components/ui/button";

type ShopeeAccountOption = { id: number; name: string; shopId: string | null };

export function ShopeeConnectionForm({ metaAccountId, metaAccountName, currentShopeeAccountId, shopeeAccounts }: { metaAccountId: number; metaAccountName: string; currentShopeeAccountId: number | null; shopeeAccounts: ShopeeAccountOption[] }) {
  const [state,action,pending] = useActionState(updateMetaAccountShopeeConnection,null);
  return <form action={action} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><input type="hidden" name="metaAccountId" value={metaAccountId} /><input type="hidden" name="originalShopeeAccountId" value={currentShopeeAccountId ?? ""} /><div><p className="text-sm font-medium text-slate-500">Koneksi Shopee</p><h2 className="mt-1 text-xl font-semibold text-slate-950">Atur Akun Shopee untuk {metaAccountName}</h2></div><label className="block text-sm font-medium text-slate-700">Akun Shopee<select name="shopeeAccountId" defaultValue={currentShopeeAccountId ?? ""} disabled={pending} className="mt-1.5 h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"><option value="">Belum terhubung</option>{shopeeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.shopId ? ` — ${account.shopId}` : ""}</option>)}</select></label><p className="text-sm leading-6 text-slate-500">Pilih akun untuk menghubungkan WL, atau pilih “Belum terhubung” untuk melepaskan koneksi. Histori campaign mengikuti WL; riwayat import dan snapshot lama tetap di akun asal. Import selanjutnya untuk campaign yang pindah dilakukan di akun tujuan.</p>{!pending && state?.message && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{state.message}</p>}<div className="flex justify-end gap-3"><Button asChild variant="ghost"><Link href="/wl">Batal</Link></Button><Button type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Simpan perubahan"}</Button></div></form>;
}
