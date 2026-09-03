"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getFilterCampaignDetailAction } from "@/app/shopee/[id]/filter/actions";
import { CampaignDailyDetail } from "@/components/filter/campaign-daily-detail";
import type { FilterCampaignDetail } from "@/lib/filter/queries";
import { historyParamsToSearch, type HistoryParams } from "@/lib/filter/server-pagination";
import { modalShouldClose } from "./campaign-history-modal-state";
import { campaignModeConfig, type CampaignMode } from "@/lib/filter/campaign-modes";

export function CampaignHistoryModal({ mode, shopeeAccountId, campaignId, campaignName, onClose }: { mode: CampaignMode; shopeeAccountId: number; campaignId: number; campaignName: string; onClose: () => void }) {
  const [detail, setDetail] = useState<FilterCampaignDetail | null>(null);
  const [error, setError] = useState("");
  const [state, setState] = useState<HistoryParams>({ sort: "date", dir: "desc", page: 1, pageSize: 25 });
  useEffect(() => { let active = true; getFilterCampaignDetailAction(shopeeAccountId, mode, campaignId, state).then((result) => { if (!active) return; if (result.success) setDetail(result.data); else setError(result.message); }); return () => { active = false; }; }, [campaignId, mode, shopeeAccountId, state]);
  useEffect(() => { function keydown(event: KeyboardEvent) { if (modalShouldClose("keydown", event.key)) onClose(); } document.addEventListener("keydown", keydown); return () => document.removeEventListener("keydown", keydown); }, [onClose]);
  return <div role="dialog" aria-modal="true" aria-label={`Histori Harian ${campaignName}`} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-0 sm:p-2 lg:p-4" onClick={() => { if (modalShouldClose("overlay")) onClose(); }}>
    <div className="flex h-dvh max-h-dvh w-full min-w-0 flex-col overflow-hidden bg-slate-50 shadow-2xl sm:h-auto sm:max-h-[95vh] sm:w-[98vw] sm:rounded-xl" onClick={(event) => event.stopPropagation()}>
      <div className="flex min-w-0 items-start justify-between gap-2 border-b border-slate-200 bg-white px-3 py-3 sm:items-center sm:gap-4 sm:px-4"><div className="min-w-0 flex-1"><p className="text-xs font-medium text-slate-500">Histori Harian</p><h2 className="truncate text-base font-semibold text-slate-950 sm:text-lg">{campaignName}</h2></div><div className="flex shrink-0 items-center gap-1 sm:gap-2"><Link href={`/shopee/${shopeeAccountId}/${campaignModeConfig[mode].route}/${campaignId}?${historyParamsToSearch(state)}`} className="max-w-24 text-right text-xs leading-tight text-slate-500 hover:underline sm:max-w-none">Buka halaman penuh</Link><button type="button" aria-label="Tutup modal" className="flex size-8 shrink-0 items-center justify-center rounded-md text-xl text-slate-500 hover:bg-slate-100" onClick={() => { if (modalShouldClose("close-button")) onClose(); }}>×</button></div></div>
      <div className="min-h-0 flex-1 overflow-auto p-2 sm:p-3">{error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : detail ? <CampaignDailyDetail mode={mode} shopeeAccountId={shopeeAccountId} detail={detail} compact onStateChange={setState} /> : <p className="p-6 text-center text-sm text-slate-500">Memuat histori…</p>}</div>
    </div>
  </div>;
}
