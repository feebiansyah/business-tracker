"use client";

import { useEffect, useRef, useState } from "react";
import { saveCampaignPostTypeAction } from "@/app/shopee/[id]/filter/post-type-actions";
import { manualPostTypes, postTypeLabels, resolvePostType, type ManualPostType, type PostTypeInput, type PostTypeResult } from "@/lib/campaign-post-type/model";

export function PostTypeSelect({ shopeeAccountId, metaCampaignId, campaignName, manualType, automatic, saveAction = saveCampaignPostTypeAction }: {
  shopeeAccountId: number; metaCampaignId: string; campaignName: string; manualType: ManualPostType | null;
  automatic?: string | null; saveAction?: (input: PostTypeInput) => Promise<PostTypeResult>;
}) {
  const [saved, setSaved] = useState(manualType);
  const [previousManual, setPreviousManual] = useState(manualType);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const inFlight = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  if (previousManual !== manualType) {
    setPreviousManual(manualType);
    setSaved(manualType);
  }
  async function save(value: string) {
    if (inFlight.current || value === (saved ?? "")) return;
    inFlight.current = true; setBusy(true); setFeedback(null);
    try {
      const result = await saveAction({ shopeeAccountId, metaCampaignId, manualType: value ? value as ManualPostType : null });
      if (!mounted.current) return;
      if (result.success) setSaved(result.manualType);
      setFeedback({ ok: result.success, text: result.success ? "Tersimpan" : result.message });
    } catch {
      if (mounted.current) setFeedback({ ok: false, text: "Jenis belum tersimpan. Coba lagi." });
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return <div className="min-w-0 space-y-1">
    <select aria-label={`Jenis ${campaignName}`} value={saved ?? ""} disabled={busy} onChange={event => save(event.target.value)} className="h-8 w-44 max-w-full rounded-md border border-slate-300 bg-white px-2 text-xs disabled:opacity-50">
      <option value="">Otomatis / tanpa override</option>
      {manualPostTypes.map(type => <option key={type} value={type}>{postTypeLabels[type]}</option>)}
    </select>
    <p className="text-xs text-slate-600">{resolvePostType(saved, automatic)}</p>
    {busy ? <span role="status" className="block text-[10px] text-slate-500">Menyimpan…</span> : feedback && <span role="status" className={`block text-[10px] ${feedback.ok ? "text-slate-500" : "text-red-600"}`}>{feedback.text}</span>}
  </div>;
}
