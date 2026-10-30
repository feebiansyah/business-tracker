import { createHash } from "node:crypto";
import { BlacklistReplacementError, buildCampaignBlacklistUpdate, zoneSetsEqual } from "./blacklist";
import type { ClickaduListMethod, ClickaduListState } from "./list-method";
import { ClickaduAmbiguousWriteError } from "./client";

type Campaign = Record<string, unknown>;
type Dependencies = { getCampaign(id: string): Promise<Campaign>; updateCampaign(id: string, payload: Campaign): Promise<void> };

export function readClickaduList(campaign: Campaign, campaignId: string): ClickaduListState {
  if (!/^\d+$/.test(campaignId) || String(campaign.id) !== campaignId) throw new BlacklistReplacementError("Identitas campaign Clickadu tidak cocok.");
  const targeting = record(campaign.targeting), zone = record(targeting?.zone);
  if (!zone || typeof zone.isExcluded !== "boolean" || !Array.isArray(zone.list)
    || zone.list.some((id) => typeof id !== "string" || !/^\d+$/.test(id))) {
    throw new BlacklistReplacementError("Daftar/metode Zone Clickadu belum dapat diverifikasi.");
  }
  if (new Set(zone.list).size !== zone.list.length) throw new BlacklistReplacementError("Daftar Zone Clickadu mengandung ID duplikat.");
  return { method: zone.isExcluded ? "BLACKLIST" : "WHITELIST", zoneIds: zone.list };
}

export function listPrecondition(campaign: Campaign, method: ClickaduListMethod, target: string[], scope: unknown) {
  return createHash("sha256").update(JSON.stringify(stable({ campaign, method, target: [...target].sort(), scope }))).digest("hex");
}

export async function applyClickaduList(campaignId: string, method: ClickaduListMethod, target: string[],
  precondition: string, scope: unknown, deps: Dependencies) {
  if ((method !== "BLACKLIST" && method !== "WHITELIST") || (method === "WHITELIST" && !target.length)
    || target.some((id) => !/^\d+$/.test(id)) || new Set(target).size !== target.length) {
    throw new BlacklistReplacementError("Target Clickadu tidak valid; Whitelist wajib berisi kandidat aman.");
  }
  const campaign = await deps.getCampaign(campaignId), before = readClickaduList(campaign, campaignId);
  if (typeof precondition !== "string" || precondition !== listPrecondition(campaign, method, target, scope)) {
    throw new BlacklistReplacementError("Campaign atau hasil analisis berubah. Siapkan konfirmasi baru.");
  }
  if (before.method === method && zoneSetsEqual(before.zoneIds, target)) return { status: "NO_CHANGE" as const, actual: before, message: "Daftar dan metode sudah sesuai." };
  const payload = buildCampaignBlacklistUpdate(campaign, target, method);
  let writeError: unknown;
  try { await deps.updateCampaign(campaignId, payload); } catch (error) { writeError = error; }
  // Even a final HTTP rejection is followed by GET; never retry PUT.
  let actual: ClickaduListState;
  try { actual = readClickaduList(await deps.getCampaign(campaignId), campaignId); }
  catch { throw new BlacklistReplacementError("Hasil penerapan belum dapat dipastikan: pembacaan verifikasi gagal. Jangan mengulang otomatis."); }
  if (actual.method !== method || !zoneSetsEqual(actual.zoneIds, target)) {
    const reason = writeError instanceof Error ? writeError.message : "Hasil GET tidak cocok dengan target yang dikonfirmasi.";
    throw new BlacklistReplacementError(`${reason} Daftar/metode tujuan belum terverifikasi; tidak ada retry otomatis.`);
  }
  if (writeError && !(writeError instanceof ClickaduAmbiguousWriteError)) {
    throw new BlacklistReplacementError(`${writeError instanceof Error ? writeError.message : "Request ditolak."} GET saat ini sesuai target, tetapi keberhasilan PUT tidak diklaim.`);
  }
  return { status: "UPDATED" as const, actual, message: writeError
    ? "GET membuktikan daftar dan metode sesuai target; respons PUT tidak membuktikan keberhasilan request itu sendiri."
    : "Daftar dan metode berhasil diganti dan diverifikasi." };
}

function record(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Campaign : null; }
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
  return value;
}
