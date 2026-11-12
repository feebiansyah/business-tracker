"use server";

import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth/session";
import { readPrefilterData, runPrefilterBatch } from "@/lib/meta-prefilter/service";
import type { PrefilterBatch, PrefilterData, PrefilterSlot } from "@/lib/meta-prefilter/types";
import { savePrefilterNote, type NoteInput } from "@/lib/meta-prefilter/notes";

export async function savePrefilterNoteAction(input: NoteInput) {
  await requireUser({ readOnly: true });
  try { return { success: true as const, note: await savePrefilterNote(input) }; }
  catch { return { success: false as const, message: "Note belum tersimpan. Pastikan snapshot dan tanggal masih sesuai, lalu coba lagi." }; }
}

export async function snapshotPrefilterAction(shopeeAccountId: number, slot: PrefilterSlot, runId?: string): Promise<{ success: true; batch: PrefilterBatch } | { success: false; message: string }> {
  const startedAt = Date.now(), receivedAt = new Date();
  await requireUser({ readOnly: true });
  try {
    const batch = await runPrefilterBatch({ shopeeAccountId,slot,runId,owner: randomUUID(),receivedAt,startedAt });
    return { success: true, batch };
  } catch { return { success: false, message: "Snapshot belum dapat diproses. Data COMPLETE sebelumnya tetap tersedia; coba lanjutkan melalui slot yang sama." }; }
}

export async function readPrefilterAction(shopeeAccountId: number): Promise<{ success: true; data: PrefilterData } | { success: false; message: string }> {
  await requireUser({ readOnly: true });
  try { return { success: true, data: await readPrefilterData(shopeeAccountId) }; }
  catch { return { success: false, message: "Tampilan snapshot belum dapat dibaca ulang. Jangan menganggap pengambilan berhasil sebelum hasilnya tersedia." }; }
}
