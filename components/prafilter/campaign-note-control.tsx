"use client";

import { useActionState } from "react";
import { updateCampaignNote, type ManualFieldActionState } from "@/app/shopee/[id]/prafilter/actions";
import { Button } from "@/components/ui/button";

const initialState: ManualFieldActionState = { success: false, message: "" };

export function CampaignNoteControl({ shopeeAccountId, campaignId, value }: { shopeeAccountId: number; campaignId: number; value: string | null }) {
  const actionWithCampaign = updateCampaignNote.bind(null, shopeeAccountId, campaignId);
  const [, action, pending] = useActionState(actionWithCampaign, initialState);
  return <form action={action} className="flex min-w-56 items-center gap-2"><input name="note" defaultValue={value ?? ""} maxLength={191} placeholder="Tulis note" className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-xs" /><Button type="submit" size="icon" variant="ghost" disabled={pending} aria-label="Simpan note">{pending ? "…" : "✓"}</Button></form>;
}
