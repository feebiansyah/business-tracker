import Link from "next/link";
import { updateMetaAccountShopeeConnection } from "@/app/shopee/actions";
import { Button } from "@/components/ui/button";

type ShopeeAccountOption = { id: number; name: string; shopId: string | null };

export function ShopeeConnectionForm({ metaAccountId, metaAccountName, currentShopeeAccountId, shopeeAccounts }: { metaAccountId: number; metaAccountName: string; currentShopeeAccountId: number | null; shopeeAccounts: ShopeeAccountOption[] }) {
  return <form action={updateMetaAccountShopeeConnection} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><input type="hidden" name="metaAccountId" value={metaAccountId} /><div><p className="text-sm font-medium text-slate-500">Koneksi Shopee</p><h2 className="mt-1 text-xl font-semibold text-slate-950">Atur Akun Shopee untuk {metaAccountName}</h2></div><label className="block text-sm font-medium text-slate-700">Akun Shopee<select name="shopeeAccountId" defaultValue={currentShopeeAccountId ?? ""} className="mt-1.5 h-10 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"><option value="">Belum terhubung</option>{shopeeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}{account.shopId ? ` — ${account.shopId}` : ""}</option>)}</select></label><p className="text-sm leading-6 text-slate-500">Pilih akun untuk menghubungkan WL, atau pilih “Belum terhubung” untuk melepaskan koneksi.</p><div className="flex justify-end gap-3"><Button asChild variant="ghost"><Link href="/wl">Batal</Link></Button><Button type="submit">Simpan perubahan</Button></div></form>;
}
