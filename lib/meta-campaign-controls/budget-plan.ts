import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { MetaConfig } from "@/lib/meta/config";
import { MetaBudgetClient } from "./budget-client";
import { parseIdrInput, parseBudgetValue } from "./budget-money";
import { budgetEligibility } from "./budget-state";
import { metaId, record, MetaReadError } from "./parse";
import { parsePreviewInput } from "./scope";
import type { BudgetConfirmation, BudgetExecution, BudgetSelection, BudgetSnapshot } from "./budget-types";

const lifetime = 5 * 60_000;
const signature = (payload: string, config: MetaConfig) => createHmac("sha256", config.appSecret || config.accessToken).update(`meta-daily-budget-confirmation:v1:${payload}`).digest();

export function parseBudgetSelection(input: unknown): BudgetSelection {
  const row = record(input);
  if (Object.keys(row).sort().join(",") !== "amount,kind,objectId,scope" || !["campaign", "adset"].includes(String(row.kind))) throw new Error("Target anggaran tidak valid.");
  return { scope: parsePreviewInput(row.scope), kind: row.kind as BudgetSelection["kind"], objectId: metaId(row.objectId), amount: parseIdrInput(row.amount) };
}

/** Exclude only the selected daily value for post-write verification, never its kind/parent. */
export function budgetContext(snapshot: BudgetSnapshot, selection: BudgetSelection, ignoreSelectedDaily = false) {
  const normalize = (object: BudgetSnapshot["campaign"]) => ({ ...object, ...(ignoreSelectedDaily && object.kind === selection.kind && object.id === selection.objectId ? { daily: "SELECTED_DAILY" } : {}) });
  return createHash("sha256").update(JSON.stringify({ target: snapshot.target, currency: snapshot.currency, sharing: snapshot.sharing, complete: snapshot.complete, campaign: normalize(snapshot.campaign), adSets: snapshot.adSets.map(normalize).sort((a, b) => a.id.localeCompare(b.id)) })).digest("hex");
}

export function confirmBudget(snapshot: BudgetSnapshot, selection: BudgetSelection, actorId: number, config: MetaConfig): BudgetConfirmation {
  const eligible = budgetEligibility(snapshot, selection.kind, selection.objectId);
  if (!eligible.editable || !eligible.object || eligible.object.daily.state !== "VALUE") throw new MetaReadError("INTEGRITY", eligible.reason);
  const issuedAt = Date.now(), expiresAt = issuedAt + lifetime;
  const oldAmount = eligible.object.daily.value;
  const payload = Buffer.from(JSON.stringify({ version: 1, actorId, selection, mode: eligible.mode, currency: "IDR", oldAmount, digest: budgetContext(snapshot, selection), issuedAt, expiresAt, nonce: randomBytes(16).toString("hex") })).toString("base64url");
  return { token: `${payload}.${signature(payload, config).toString("base64url")}`, target: snapshot.target, object: eligible.object, mode: eligible.mode, currency: "IDR", oldAmount, newAmount: selection.amount, expiresAt: new Date(expiresAt).toISOString() };
}

export function readBudgetConfirmation(input: unknown, actorId: number, config: MetaConfig) {
  if (typeof input !== "string" || input.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(input)) throw new Error("Konfirmasi anggaran tidak valid.");
  const [payload, tag] = input.split(".");
  const received = Buffer.from(tag, "base64url"), expected = signature(payload, config);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error("Konfirmasi bukan untuk tindakan anggaran ini.");
  const claims = record(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
  const now = Date.now();
  if (claims.version !== 1 || claims.actorId !== actorId || claims.currency !== "IDR" || !["CAMPAIGN", "ADSET"].includes(String(claims.mode))
    || typeof claims.digest !== "string" || !/^[a-f0-9]{64}$/.test(claims.digest) || parseBudgetValue(claims.oldAmount).state !== "VALUE"
    || typeof claims.oldAmount !== "string" || BigInt(claims.oldAmount) <= BigInt(0) || !Number.isSafeInteger(claims.issuedAt) || !Number.isSafeInteger(claims.expiresAt)
    || (claims.issuedAt as number) > now || (claims.expiresAt as number) <= now || (claims.expiresAt as number) - (claims.issuedAt as number) !== lifetime) throw new Error("Konfirmasi anggaran kedaluwarsa/tidak sesuai pengguna.");
  return { selection: parseBudgetSelection(claims.selection), digest: claims.digest, oldAmount: claims.oldAmount, mode: claims.mode, expiresAt: claims.expiresAt as number };
}

export async function executeBudget(confirmed: ReturnType<typeof readBudgetConfirmation>, snapshot: BudgetSnapshot, client: MetaBudgetClient): Promise<BudgetExecution> {
  const { selection } = confirmed;
  const result = (status: BudgetExecution["status"], message: string, postSent: boolean, latest = snapshot): BudgetExecution => ({ status, message, postSent, snapshot: latest, requests: client.budget.requests });
  const eligible = budgetEligibility(snapshot, selection.kind, selection.objectId);
  if (!eligible.editable || eligible.mode !== confirmed.mode || !eligible.object || eligible.object.daily.state !== "VALUE" || eligible.object.daily.value !== confirmed.oldAmount || budgetContext(snapshot, selection) !== confirmed.digest) {
    return result("RECONFIRM_REQUIRED", "Nilai lama, jenis/relasi, mata uang, sumber, jadwal atau pengaturan berubah. Tidak ada POST; baca dan konfirmasi ulang.", false);
  }
  // Preflight/auth/lookup may consume the last seconds of a valid confirmation.
  // Its signed deadline must still hold when scheduling a write, not just at entry.
  if (Date.now() >= confirmed.expiresAt) return result("RECONFIRM_REQUIRED", "Konfirmasi kedaluwarsa selama pembacaan ulang. Tidak ada POST; konfirmasi ulang diperlukan.", false);
  if (eligible.object.daily.value === selection.amount) return result("ALREADY_MATCH", "GET terbaru membuktikan nominal sudah sama. Tidak ada POST dijalankan.", false);
  // Account for observed typed-edge pagination and at most one retry per GET.
  // Unforeseen growth still hits the same global hard cap and yields UNVERIFIED.
  if (client.budget.requests + 1 + client.lastReadCost * 2 > 100 || client.budget.remaining() < 1_000) return result("REJECTED", "Sisa budget tidak cukup untuk POST dan pembacaan verifikasi; tidak ada POST.", false);
  const before = client.budget.requests;
  let response: Awaited<ReturnType<MetaBudgetClient["writeDailyBudget"]>>;
  if (Date.now() >= confirmed.expiresAt) return result("RECONFIRM_REQUIRED", "Konfirmasi kedaluwarsa sebelum POST. Konfirmasi ulang diperlukan.", false);
  try { response = await client.writeDailyBudget(selection.objectId, selection.amount); }
  catch { return result("REJECTED", "POST tidak dapat dijadwalkan dalam budget tindakan.", client.budget.requests > before); }
  const postSent = client.budget.requests > before;
  const detail = response === "ACKNOWLEDGED" ? "Meta mengakui POST." : response === "REJECTED" ? "Meta menolak respons POST." : "Hasil POST ambigu/timeout; tidak diulang.";
  try {
    // Await the full pipeline. Never race it into the background after a write.
    const latest = await client.snapshot(snapshot.target);
    const current = budgetEligibility(latest, selection.kind, selection.objectId);
    if (current.editable && current.mode === confirmed.mode && current.object?.daily.state === "VALUE" && current.object.daily.value === selection.amount
      && budgetContext(latest, selection, true) === budgetContext(snapshot, selection, true)) {
      return result("VERIFIED", `${detail} GET akhir membuktikan nominal baru, sumber IDR dan relasi target valid.${response !== "ACKNOWLEDGED" ? " Tidak menyimpulkan siapa yang menyebabkan perubahan tersebut." : ""}`, postSent, latest);
    }
    return result("UNVERIFIED", `${detail} GET akhir belum membuktikan nominal dan seluruh precondition sesuai. Jangan ulangi otomatis; baca ulang sebelum tindakan berikutnya.`, postSent, latest);
  } catch {
    return { status: "UNVERIFIED", message: `${detail} Verifikasi GET gagal/tidak lengkap. POST mungkin sudah diterapkan; tidak diulang dan tidak di-rollback otomatis.`, postSent, requests: client.budget.requests };
  }
}
