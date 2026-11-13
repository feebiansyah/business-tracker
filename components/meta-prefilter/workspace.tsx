"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { readPrefilterAction, savePrefilterNoteAction, savePrefilterPostTypeAction, snapshotPrefilterAction } from "@/app/shopee/[id]/prefilter/actions";
import { PostTypeSelect } from "@/components/filter/post-type-select";
import type { ManualPostType, PostTypeInput } from "@/lib/campaign-post-type/model";
import type { PrefilterData, PrefilterProgress, PrefilterRow, PrefilterSlot } from "@/lib/meta-prefilter/types";

const slots = ["AWAL","AKHIR"] as const;
const label = { AWAL: "Snapshot Awal", AKHIR: "Snapshot Akhir" };
const rupiah = new Intl.NumberFormat("id-ID",{ minimumFractionDigits: 0,maximumFractionDigits: 0 });
const money = (value: string | number | null) => value === null ? "—" : rupiah.format(Number(value));
const time = (value: string) => new Intl.DateTimeFormat("id-ID",{ dateStyle: "medium",timeStyle: "medium",timeZone: "Asia/Jakarta" }).format(new Date(value))+" WIB";

const clicks = (value: string | bigint | null | undefined) => value == null ? "—" : new Intl.NumberFormat("id-ID").format(BigInt(value));
const numericCell = "whitespace-nowrap px-2 py-2 text-right tabular-nums";

export function PrefilterWorkspace({ initial }: { initial: PrefilterData }) {
  const [data,setData] = useState(initial), [busy,setBusy] = useState<PrefilterSlot | null>(null);
  const [notice,setNotice] = useState<{ text: string; ok?: boolean } | null>(null);
  const [query,setQuery] = useState(""), [wl,setWl] = useState("");
  const [drafts,setDrafts] = useState<Record<string,string>>({});
  const [noteFeedback,setNoteFeedback] = useState<Record<string,{pending?: boolean; ok?: boolean; text: string}>>({});
  const noteSaves = useRef(new Set<string>());
  const postTypeVersion = useRef(0);
  const postTypeWrites = useRef(new Map<string, { version: number; manualType: ManualPostType | null }>());
  const inFlight = useRef(false), epoch = useRef(0);
  useEffect(()=>()=>{ epoch.current++; },[initial.account.id]);
  useEffect(()=>{
    // Local expiry only: no polling, provider request, or automatic snapshot.
    const midnight = Date.parse(data.businessDate+"T00:00:00+07:00")+86_400_000;
    const timer = setTimeout(()=>{
      epoch.current++; inFlight.current=false; setBusy(null);
      const date = new Intl.DateTimeFormat("en-CA",{ timeZone: "Asia/Jakarta",year: "numeric",month: "2-digit",day: "2-digit" }).format(new Date());
      setData(current=>({ ...current,businessDate: date,snapshots: { AWAL: null,AKHIR: null },progress: null,notes: [] }));
      setDrafts({}); setNoteFeedback({}); noteSaves.current.clear();
      setNotice({ text: "Tanggal WIB berganti. Ambil snapshot hari ini; data kemarin tidak ditampilkan." });
    },Math.max(0,midnight-Date.now()));
    return ()=>clearTimeout(timer);
  },[data.businessDate]);
  async function saveNote(metaCampaignId: string, note: string, completed: boolean) {
    const saved = data.notes.find(n=>n.metaCampaignId === metaCampaignId);
    if (inFlight.current || noteSaves.current.has(metaCampaignId) || (note.trim() === (saved?.note ?? "") && completed === (saved?.completed ?? false))) return;
    noteSaves.current.add(metaCampaignId);
    const ticket = epoch.current;
    setNoteFeedback(current=>({...current,[metaCampaignId]:{pending:true,text:"Menyimpan…"}}));
    try {
      const result = await savePrefilterNoteAction({shopeeAccountId:initial.account.id,businessDate:data.businessDate,metaCampaignId,note,completed});
      if (ticket !== epoch.current) return;
      if (result.success) {
        setData(current=>({...current,notes:[...current.notes.filter(n=>n.metaCampaignId !== metaCampaignId),result.note]}));
        setDrafts(current=>({...current,[metaCampaignId]:result.note.note}));
      }
      setNoteFeedback(current=>({...current,[metaCampaignId]:{ok:result.success,text:result.success ? "Tersimpan" : result.message}}));
    } catch {
      if (ticket === epoch.current) setNoteFeedback(current=>({...current,[metaCampaignId]:{text:"Note belum tersimpan. Coba lagi."}}));
    } finally { if (ticket === epoch.current) noteSaves.current.delete(metaCampaignId); }
  }
  async function savePostType(input: PostTypeInput) {
    const ticket = epoch.current;
    const result = await savePrefilterPostTypeAction({ ...input, businessDate: data.businessDate });
    if (result.success && ticket === epoch.current) {
      postTypeWrites.current.set(input.metaCampaignId, { version: ++postTypeVersion.current, manualType: result.manualType });
      setData(current => {
        const postTypes = { ...current.postTypes };
        if (result.manualType === null) delete postTypes[input.metaCampaignId];
        else postTypes[input.metaCampaignId] = result.manualType;
        return { ...current, postTypes };
      });
    }
    return result;
  }
  async function capture(slot: PrefilterSlot) {
    if (inFlight.current || noteSaves.current.size) return;
    inFlight.current = true; const ticket = epoch.current;
    setBusy(slot); setNotice(null);
    try {
      let runId: string | undefined;
      while (ticket === epoch.current) {
        const response = await snapshotPrefilterAction(initial.account.id,slot,runId);
        if (ticket !== epoch.current) return;
        if (!response.success) { setNotice({ text: response.message }); break; }
        const batch = response.batch; runId = batch.progress.runId;
        setData(current=>({ ...current,progress: batch.progress }));
        if (!batch.shouldContinue) {
          const p = batch.progress;
          const message = batch.blocked ? "Snapshot sedang diproses permintaan lain. Klik slot yang sama untuk melanjutkan setelah unit selesai." : p.status === "COMPLETE" ? `${label[p.slot]} selesai.` : p.message ?? "Pengambilan dijeda. Snapshot COMPLETE sebelumnya tetap tampil; klik slot untuk melanjutkan.";
          setNotice({ ok: p.status === "COMPLETE", text: message+(p.skipped.length ? ` WL dilewati: ${p.skipped.join("; ")}.` : "") });
          break;
        }
      }
      const readTypeVersion = postTypeVersion.current;
      const read = await readPrefilterAction(initial.account.id);
      if (ticket !== epoch.current) return;
      if (read.success) {
        const postTypes = { ...read.data.postTypes };
        // Keep confirmed edits that finished after this snapshot read began.
        for (const [id, write] of postTypeWrites.current) if (write.version > readTypeVersion) {
          if (write.manualType === null) delete postTypes[id];
          else postTypes[id] = write.manualType;
        }
        setData({ ...read.data, postTypes });
      }
      else setNotice({ text: read.message });
    } catch {
      if (ticket === epoch.current) setNotice({ text: "Koneksi terputus. Snapshot COMPLETE sebelumnya tetap tampil; klik slot yang sama untuk melanjutkan progres tersimpan." });
    } finally {
      if (ticket === epoch.current) { inFlight.current=false; setBusy(null); }
    }
  }
  const joined = new Map<string,{ AWAL?: PrefilterRow; AKHIR?: PrefilterRow }>();
  for (const slot of slots) for (const row of data.snapshots[slot]?.rows ?? []) joined.set(row.metaCampaignId,{ ...joined.get(row.metaCampaignId),[slot]: row });
  const rows = [...joined.values()].filter(r=>{
    const last = r.AKHIR ?? r.AWAL!;
    return last.campaignName.toLowerCase().includes(query.toLowerCase()) && (!wl || String(last.metaAccountId) === wl);
  }).sort((a,b)=>{
    const left = (a.AKHIR ?? a.AWAL)!, right = (b.AKHIR ?? b.AWAL)!;
    return (right.cpc === null ? -Infinity : Number(right.cpc))-(left.cpc === null ? -Infinity : Number(left.cpc)) || left.metaCampaignId.localeCompare(right.metaCampaignId);
  });
  const wlOptions = [...new Map([...joined.values()].map(r=>{ const row = (r.AKHIR ?? r.AWAL)!; return [row.metaAccountId,row.wlName] as const; })).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
  const progress: PrefilterProgress | null = data.progress;
  const notes = new Map(data.notes.map(n=>[n.metaCampaignId,n]));
  const pendingNotes = data.notes.filter(n=>joined.has(n.metaCampaignId) && n.note.trim() && !n.completed).length;
  const savingNote = Object.values(noteFeedback).some(n=>n.pending);
  return <div className="min-w-0 space-y-3">
    <p className="text-sm text-slate-600">Hari berjalan (WIB): {new Intl.DateTimeFormat("id-ID",{ dateStyle: "long",timeZone: "UTC" }).format(new Date(data.businessDate+"T00:00:00Z"))}</p>
    {notice && <p role={notice.ok ? "status" : "alert"} className={`rounded-lg border p-3 text-sm ${notice.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{notice.text}</p>}
    {progress && <p role="status" className="break-words text-xs text-slate-600">{label[progress.slot]}: {progress.status} · WL {progress.current}/{progress.total} · {progress.pages} halaman Meta. {progress.message}</p>}
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">{slots.map(slot=>{
      const snapshot = data.snapshots[slot];
      const resume = progress?.slot === slot && ["RUNNING","PAUSED_RATE_LIMIT"].includes(progress.status);
      return <section key={slot} className="min-w-0 space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <h3 className="font-semibold">{label[slot]}</h3>
        {snapshot ? <p className="text-xs leading-relaxed text-slate-600">Klik: {time(snapshot.requestedAt)}<br/>Selesai: {time(snapshot.finishedAt)} · {snapshot.rows.length} campaign dengan spend &gt; 0</p> : <p className="text-xs text-slate-500">Belum ada snapshot COMPLETE hari ini.</p>}
        {snapshot?.skipped.length ? <p className="break-words text-xs text-amber-800">WL dilewati: {snapshot.skipped.join("; ")}. Data WL tersebut tidak termasuk snapshot.</p> : null}
        <button type="button" disabled={!!busy || savingNote || !!(progress && progress.slot !== slot && ["RUNNING","PAUSED_RATE_LIMIT"].includes(progress.status))} onClick={()=>capture(slot)} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{busy === slot ? "Mengambil…" : `${resume ? "Lanjutkan" : snapshot ? "Perbarui" : "Ambil"} ${label[slot]}`}</button>
      </section>;
    })}</div>
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
      <label className="grid min-w-0 gap-1 text-xs sm:flex-1">Cari campaign<input value={query} onChange={event=>setQuery(event.target.value)} disabled={!!busy} className="h-9 min-w-0 rounded-md border border-slate-300 px-3 text-sm"/></label>
      <label className="grid min-w-0 gap-1 text-xs">WL<select value={wl} onChange={event=>setWl(event.target.value)} disabled={!!busy} className="h-9 min-w-0 max-w-full rounded-md border border-slate-300 px-2 text-sm"><option value="">Semua WL</option>{wlOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
      <p className="text-xs text-slate-500">{rows.length} campaign · CPC tertinggi (Akhir, fallback Awal)</p>
      {pendingNotes > 0 && <span role="status" className="self-start rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700">{pendingNotes} note belum selesai</span>}
    </div>
    <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="max-h-[70dvh] max-w-full overflow-auto overscroll-contain" tabIndex={0} role="region" aria-label="Tabel PraFilter"><table className="w-full min-w-[1440px] border-separate border-spacing-0 text-left text-xs"><thead className="sticky top-0 z-20 bg-slate-50 text-slate-600 shadow-sm [&_th]:border-b [&_th]:border-slate-200 [&_th]:bg-slate-50 [&_th]:px-2 [&_th]:py-2"><tr className="border-b border-slate-200"><th rowSpan={2} className="sticky left-0 z-30 border-r border-slate-200 shadow-[2px_0_4px_-2px_rgba(15,23,42,0.25)]">Campaign</th><th rowSpan={2}>WL</th><th rowSpan={2}>Jenis</th><th colSpan={3} className="border-l-2 border-slate-300 text-center">Snapshot Awal</th><th colSpan={3} className="border-l-2 border-slate-300 text-center">Snapshot Akhir</th><th colSpan={3} className="border-l-2 border-slate-300 text-center">Perubahan Akhir − Awal</th><th rowSpan={2} className="border-l-2 border-slate-300">Note</th><th rowSpan={2} className="text-center">Selesai</th></tr><tr>{["awal","akhir","perubahan"].map(group=><Fragment key={group}><th className="border-l-2 border-slate-300 text-right">CPC</th><th className="text-right">Spend +5%</th><th className="text-right">{group === "perubahan" ? "Klik" : "Klik Meta"}</th></Fragment>)}</tr></thead><tbody className="[&_td]:border-b [&_td]:border-slate-200">{rows.map(row=>{
      const last = (row.AKHIR ?? row.AWAL)!;
      const saved = notes.get(last.metaCampaignId), draft = drafts[last.metaCampaignId] ?? saved?.note ?? "", feedback = noteFeedback[last.metaCampaignId];
      const delta = row.AWAL && row.AKHIR ? {cpc: row.AWAL.cpc === null || row.AKHIR.cpc === null ? null : Number(row.AKHIR.cpc)-Number(row.AWAL.cpc),fee:Number(row.AKHIR.withFee)-Number(row.AWAL.withFee),clicks:row.AWAL.clicks === null || row.AKHIR.clicks === null ? null : BigInt(row.AKHIR.clicks)-BigInt(row.AWAL.clicks)} : null;
      return <tr key={last.metaCampaignId} className="align-top"><td className="sticky left-0 z-10 w-52 min-w-40 max-w-56 break-words border-r border-slate-200 bg-white px-2 py-2 shadow-[2px_0_4px_-2px_rgba(15,23,42,0.25)]"><span className="font-medium">{last.campaignName}</span>{saved?.note.trim() && !saved.completed && <span title="Ada catatan belum selesai" aria-label="Ada catatan belum selesai" className="ml-1 inline-block size-2 rounded-full bg-red-500"/>}<span className="mt-0.5 block break-all text-[10px] text-slate-500">{last.metaCampaignId}</span></td><td className="max-w-32 break-words px-2 py-2">{last.wlName}</td><td className="px-2 py-2"><PostTypeSelect key={`${initial.account.id}:${data.businessDate}:${last.metaCampaignId}`} shopeeAccountId={initial.account.id} metaCampaignId={last.metaCampaignId} campaignName={last.campaignName} manualType={data.postTypes?.[last.metaCampaignId] ?? null} saveAction={savePostType} /></td>
        {slots.map(slot=><Fragment key={slot}><td className={`${numericCell} border-l-2 border-slate-300`}>{money(row[slot]?.cpc ?? null)}</td><td className={numericCell}>{money(row[slot]?.withFee ?? null)}</td><td className={numericCell}>{clicks(row[slot]?.clicks)}</td></Fragment>)}
        <td className={`${numericCell} border-l-2 border-slate-300`}>{money(delta?.cpc ?? null)}</td><td className={numericCell}>{money(delta?.fee ?? null)}</td><td className={numericCell}>{clicks(delta?.clicks)}</td>
        <td className="w-44 border-l-2 border-slate-300 px-2 py-2"><input aria-label={`Note ${last.campaignName}`} value={draft} maxLength={2000} disabled={!!busy || !!feedback?.pending} placeholder="Tambahkan note" onChange={event=>{
          setDrafts(current=>({...current,[last.metaCampaignId]:event.target.value}));
          setNoteFeedback(current=>{const next={...current};delete next[last.metaCampaignId];return next;});
        }} onBlur={event=>{
          // Let the same row's checkbox save draft + completion together, without swallowing its click.
          if (event.relatedTarget?.getAttribute("data-note-campaign") !== last.metaCampaignId) return saveNote(last.metaCampaignId,event.currentTarget.value,saved?.completed ?? false);
        }} className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs disabled:bg-slate-50"/>{feedback && <span role="status" className={`mt-1 block text-[10px] ${feedback.ok || feedback.pending ? "text-slate-500" : "text-red-600"}`}>{feedback.text}</span>}</td>
        <td className="px-2 py-2 text-center"><input type="checkbox" data-note-campaign={last.metaCampaignId} aria-label={`Selesai ${last.campaignName}`} checked={saved?.completed ?? false} disabled={!!busy || !!feedback?.pending} onChange={event=>saveNote(last.metaCampaignId,draft,event.target.checked)} onBlur={()=>saveNote(last.metaCampaignId,draft,saved?.completed ?? false)} className="size-4 accent-slate-900"/></td></tr>;
    })}{!rows.length && <tr><td colSpan={14} className="p-6 text-center text-slate-500">Belum ada campaign dengan spend &gt; 0 pada snapshot COMPLETE yang sesuai filter.</td></tr>}</tbody></table></div></div>
  </div>;
}
