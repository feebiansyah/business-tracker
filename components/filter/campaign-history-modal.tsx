"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getFilterCampaignDetailAction } from "@/app/shopee/[id]/filter/actions";
import { CampaignDailyDetail } from "@/components/filter/campaign-daily-detail";
import type { FilterCampaignDetail } from "@/lib/filter/queries";
import { historyParamsToSearch, type HistoryParams } from "@/lib/filter/server-pagination";
import { modalShouldClose } from "./campaign-history-modal-state";

export function CampaignHistoryModal({ shopeeAccountId, campaignId, campaignName, onClose }: { shopeeAccountId: number; campaignId: number; campaignName: string; onClose: () => void }) {
  const [detail, setDetail] = useState<FilterCampaignDetail | null>(null);
  const [error, setError] = useState("");
  const [state, setState] = useState<HistoryParams>({ sort: "date", dir: "desc", page: 1, pageSize: 25 });
  useEffect(() => { let active = true; getFilterCampaignDetailAction(shopeeAccountId, campaignId, state).then((result) => { if (!active) return; if (result.success) setDetail(result.data); else setError(result.message); }); return () => { active = false; }; }, [campaignId, shopeeAccountId, state]);
  useEffect(() => { function keydown(event: KeyboardEvent) { if (modalShouldClose("keydown", event.key)) onClose(); } document.addEventListener("keydown", keydown); return () => document.removeEventListener("keydown", keydown); }, [onClose]);
  return <div role="dialog" aria-modal="true" aria-label={`Histori Harian ${campaignName}`} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-2 sm:p-4" onClick={() => { if (modalShouldClose("overlay")) onClose(); }}>
    <div className="flex max-h-[95vh] w-[98vw] flex-col overflow-hidden rounded-xl bg-slate-50 shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3"><div className="min-w-0"><p className="text-xs font-medium text-slate-500">Histori Harian</p><h2 className="truncate text-lg font-semibold text-slate-950">{campaignName}</h2></div><div className="flex items-center gap-2"><Link href={`/shopee/${shopeeAccountId}/filter/${campaignId}?${historyParamsToSearch(state)}`} className="text-xs text-slate-500 hover:underline">Buka halaman penuh</Link><button type="button" aria-label="Tutup modal" className="flex size-8 items-center justify-center rounded-md text-xl text-slate-500 hover:bg-slate-100" onClick={() => { if (modalShouldClose("close-button")) onClose(); }}>×</button></div></div>
      <div className="min-h-0 flex-1 overflow-auto p-2 sm:p-3">{error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : detail ? <CampaignDailyDetail shopeeAccountId={shopeeAccountId} detail={detail} compact onStateChange={setState} /> : <p className="p-6 text-center text-sm text-slate-500">Memuat histori…</p>}</div>
    </div>
  </div>;
}
