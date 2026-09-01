"use client";

import { useActionState } from "react";
import { updateCampaignJenis, type ManualFieldActionState } from "@/app/shopee/[id]/prafilter/actions";

const initialState: ManualFieldActionState = { success: false, message: "" };

export function CampaignJenisControl({ shopeeAccountId, campaignId, value }: { shopeeAccountId: number; campaignId: number; value: string | null }) {
  const actionWithCampaign = updateCampaignJenis.bind(null, shopeeAccountId, campaignId);
  const [, action, pending] = useActionState(actionWithCampaign, initialState);
  return <form action={action}><select name="jenis" defaultValue={value ?? ""} disabled={pending} onChange={(event) => event.currentTarget.form?.requestSubmit()} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs"><option value="">-</option><option value="GAMBAR">GAMBAR</option><option value="VIDEO">VIDEO</option></select></form>;
}
