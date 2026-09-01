"use client";

import { useActionState } from "react";
import { updateCampaignOperationalStatus, type ManualFieldActionState } from "@/app/shopee/[id]/prafilter/actions";

const initialState: ManualFieldActionState = { success: false, message: "" };

export function CampaignStatusControl({ shopeeAccountId, campaignId, value }: { shopeeAccountId: number; campaignId: number; value: string }) {
  const actionWithCampaign = updateCampaignOperationalStatus.bind(null, shopeeAccountId, campaignId);
  const [, action, pending] = useActionState(actionWithCampaign, initialState);
  return <form action={action}><select name="operationalStatus" defaultValue={value} disabled={pending} onChange={(event) => event.currentTarget.form?.requestSubmit()} className={`h-8 rounded-md border px-2 text-xs font-medium ${value === "OFF" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}><option value="ON">ON</option><option value="OFF">OFF</option></select></form>;
}
