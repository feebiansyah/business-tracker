"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { syncPrafilterAction, type PrafilterActionState } from "@/app/shopee/[id]/prafilter/actions";
import { Button } from "@/components/ui/button";

const initialState: PrafilterActionState = { success: false, message: "" };

export function PrafilterToolbar({ shopeeAccountId, selectedDate, disabled }: { shopeeAccountId: number; selectedDate: string; disabled: boolean }) {
  const router = useRouter();
  const actionWithAccount = syncPrafilterAction.bind(null, shopeeAccountId);
  const [state, action, pending] = useActionState(async (previousState: PrafilterActionState, formData: FormData) => {
    const result = await actionWithAccount(previousState, formData);
    if (result.success && result.selectedDate) router.replace(`/shopee/${shopeeAccountId}/prafilter?date=${result.selectedDate}`);
    return result;
  }, initialState);

  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium text-slate-700">Tanggal
          <input type="date" name="date" defaultValue={selectedDate} required className="mt-1.5 block h-9 rounded-md border border-slate-200 bg-white px-3 text-sm" />
        </label>
        <Button type="submit" disabled={disabled || pending}>{pending ? "Sedang mengambil Prafilter..." : "Ambil Prafilter"}</Button>
      </form>
      {state.message && <p role="status" className={`rounded-md px-3 py-2 text-sm ${state.success ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{state.message}</p>}
    </div>
  );
}
