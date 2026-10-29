import "server-only";

import { parseShopeeAccountId } from "./config-input";
import { campaignKey, digest } from "../adsterra-operations/canonical";
import { parseCampaignInfo } from "../adsterra-operations/provider";
import { assessReadiness, listDigest, storedMethod } from "../adsterra-operations/method-state";
import type { MethodInfo, MethodState } from "../adsterra-operations/types";
import type { StoredMethodRow } from "../adsterra-operations/method-state";
import type { PlacementListBatch, PlacementListKind, PlacementListRead } from "./placement-list-types";

type Config = { id: number; shopeeAccountId: number; campaignId: string };
type Dependencies = {
  loadConfigs(accountId: number): Promise<Config[]>;
  loadCredential(accountId: number): Promise<{ shopeeAccountId: number; provider: string; encryptedSecret: string } | null>;
  decrypt(secret: string): string;
  loadMethods(ids: string[]): Promise<(StoredMethodRow & { campaignId: string })[]>;
};

function unavailable(message: string): PlacementListRead {
  return { status: "UNAVAILABLE", message, attemptedAt: new Date().toISOString() };
}

function parseListCount(body: unknown, kind: PlacementListKind): { count: number; digest: string } {
  if (body && typeof body === "object" && ("error" in body || "errors" in body)) throw new Error("API_ERROR_BODY");
  // Only blacklist documents [] as the empty top-level response. Whitelist
  // documents { placement_ids: [] }. null/missing is never an empty list.
  const ids: unknown = Array.isArray(body) && kind === "blacklist" && body.length === 0
    ? body
    : body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).placement_ids : undefined;
  if (!Array.isArray(ids)) throw new Error("INVALID_LIST");
  const unique = new Set<string>();
  for (const id of ids) {
    const numeric = typeof id === "number" && Number.isSafeInteger(id) && id > 0;
    // Blacklist also documents string placement IDs (resale placement hashes).
    const stringId = kind === "blacklist" && typeof id === "string"
      && (/^[1-9]\d*$/.test(id) || /^[A-Za-z0-9]{32}$/.test(id));
    if (!numeric && !stringId) throw new Error("INVALID_PLACEMENT");
    const key = String(id);
    if (unique.has(key)) throw new Error("DUPLICATE_PLACEMENT");
    unique.add(key);
  }
  return { count: unique.size, digest: listDigest([...unique]) };
}

async function readList(campaignId: string, kind: PlacementListKind, token: string, budget: AbortSignal): Promise<PlacementListRead> {
  if (budget.aborted) return unavailable("Batas waktu pembacaan tercapai. Silakan refresh.");
  const signal = AbortSignal.any([budget, AbortSignal.timeout(10_000)]);
  try {
    const response = await fetch(`https://api3.adsterratools.com/advertiser/campaign/${campaignId}/linking/${kind}.json`, {
      method: "GET", headers: { "X-API-Key": token, Accept: "application/json" },
      cache: "no-store", redirect: "error", signal,
    });
    if ([204, 404, 405, 501].includes(response.status)) {
      return unavailable(`Daftar tidak tersedia dari API (HTTP ${response.status}); bukan berarti kosong.`);
    }
    if (!response.ok) return { status: "ERROR", message: `Pembacaan API gagal (HTTP ${response.status}).`, attemptedAt: new Date().toISOString() };
    const body: unknown = await response.json();
    if (body === null || (typeof body === "object" && !Array.isArray(body)
      && (body as Record<string, unknown>).placement_ids === null)) {
      return unavailable("API tidak menyediakan daftar placement yang dapat dihitung; bukan berarti kosong.");
    }
    const counts = parseListCount(body, kind);
    if (signal.aborted) throw new Error("TIMEOUT");
    return { status: "SUCCESS", ...counts, readAt: new Date().toISOString() };
  } catch {
    return { status: "ERROR", message: signal.aborted
      ? "Pembacaan melewati batas waktu. Silakan refresh."
      : "Daftar gagal dimuat atau respons API tidak valid.", attemptedAt: new Date().toISOString() };
  }
}

// Each batch revalidates account/config/credential scope and reads whole physical
// campaigns. 13 * 3 GET = 39 (under the existing 40-request ceiling), two workers.
export async function loadAdsterraPlacementLists(
  input: unknown, deps: Dependencies, budget: AbortSignal, deadlineAt = Date.now() + 45_000,
  continuation: unknown = null,
): Promise<PlacementListBatch> {
  const accountId = parseShopeeAccountId(input), configs = await deps.loadConfigs(accountId);
  budget.throwIfAborted();
  if (configs.some((config) => config.shopeeAccountId !== accountId)) throw new Error("CONFIG_SCOPE_MISMATCH");
  const aliases = configs.map((config) => ({ config, id: campaignKey(config.campaignId) }));
  const physical = [...new Set(aliases.map((alias) => alias.id))].sort((a, b) => Number(a) - Number(b));
  const credential = await deps.loadCredential(accountId);
  budget.throwIfAborted();
  if (credential && (credential.shopeeAccountId !== accountId || credential.provider !== "ADSTERRA")) throw new Error("CREDENTIAL_SCOPE_MISMATCH");
  // Only a digest leaves the server. No credential or raw database object in DTO.
  const scope = digest([accountId, aliases.map(({ config, id }) => [config.id, id]).sort((a, b) => Number(a[0]) - Number(b[0])),
    credential ? digest(credential.encryptedSecret) : null]);
  let offset = 0;
  if (continuation !== null && continuation !== undefined) {
    if (typeof continuation !== "object" || Array.isArray(continuation)) throw new Error("INVALID_CONTINUATION");
    const cursor = continuation as Record<string, unknown>;
    if (cursor.scope !== scope || typeof cursor.after !== "string" || campaignKey(cursor.after) !== cursor.after) throw new Error("CONTINUATION_SCOPE_CHANGED");
    const index = physical.indexOf(cursor.after);
    if (index < 0) throw new Error("CONTINUATION_SCOPE_CHANGED");
    offset = index + 1;
  }
  const ids = physical.slice(offset, offset + Math.floor(40 / 3));
  const methods = new Map<string, MethodState>(), methodErrors = new Map<string, string>();
  try {
    const rows = ids.length ? await deps.loadMethods(ids) : [];
    budget.throwIfAborted();
    for (const id of ids) {
      try { methods.set(id, storedMethod(rows.find((row) => row.campaignId === id) ?? null)); }
      catch { methodErrors.set(id, "Metadata metode tidak valid; bukan metode belum ditetapkan."); }
    }
  } catch (error) {
    const code = error && typeof error === "object" ? "code" in error ? error.code : "errorCode" in error ? error.errorCode : null : null;
    const message = code === "P2021" ? "Tabel penyimpanan metode belum tersedia. Periksa migrasi lokal."
      : code === "P2022" ? "Kolom penyimpanan metode belum tersedia. Periksa migrasi lokal."
      : ["P1000", "P1001", "P1002", "P1017"].includes(String(code)) ? "Koneksi/autentikasi database metode gagal; bukan metode belum ditetapkan."
      : "Penyimpanan metode belum tersedia/gagal dibaca; bukan metode belum ditetapkan.";
    for (const id of ids) methodErrors.set(id, message);
  }
  budget.throwIfAborted();
  const initial = unavailable(credential ? "Belum dibaca dalam batch ini." : "Koneksi Adsterra belum dikonfigurasi.");
  const records = new Map(ids.map((id) => [id, { blacklist: initial, whitelist: initial, pricing: null as string | null }]));
  let readCount = ids.length;
  if (credential && ids.length) {
    const token = deps.decrypt(credential.encryptedSecret);
    const remainingMs = Math.min(30_000, deadlineAt - Date.now() - 1_000);
    if (remainingMs <= 0) throw new Error("BATCH_DEADLINE");
    {
      const providerBudget = AbortSignal.any([budget, AbortSignal.timeout(remainingMs)]);
      let nextId = 0;
      async function worker() {
        while (nextId < ids.length && !providerBudget.aborted) {
          const id = ids[nextId++], record = records.get(id)!;
          record.blacklist = await readList(id, "blacklist", token, providerBudget);
          record.whitelist = await readList(id, "whitelist", token, providerBudget);
          const signal = AbortSignal.any([providerBudget, AbortSignal.timeout(10_000)]);
          if (!signal.aborted) try {
            const response = await fetch(`https://api3.adsterratools.com/advertiser/campaign/${id}.json`, {
              method: "GET", headers: { "X-API-Key": token, Accept: "application/json" }, cache: "no-store", redirect: "error", signal,
            });
            if (!response.ok) throw new Error("CAPABILITY_UNAVAILABLE");
            const info = parseCampaignInfo(await response.json(), id);
            signal.throwIfAborted();
            record.pricing = info.pricing;
          } catch { /* Unknown capability never permits readiness. */ }
        }
      }
      await Promise.all(Array.from({ length: Math.min(2, ids.length) }, worker));
      readCount = nextId;
      if (!readCount) throw new Error("BATCH_DEADLINE");
    }
  }
  const selected = new Set(ids.slice(0, readCount));
  const lists = aliases.filter(({ id }) => selected.has(id)).map(({ config, id }) => {
    const record = records.get(id)!, method = methods.get(id), error = methodErrors.get(id);
    const application: MethodInfo = method && !error ? { status: "SUCCESS", method,
      ...assessReadiness(method, { blacklist: record.blacklist.status === "SUCCESS" ? record.blacklist : null,
        whitelist: record.whitelist.status === "SUCCESS" ? record.whitelist : null }, record.pricing), readAt: new Date().toISOString() }
      : { status: "UNAVAILABLE", method: null, readiness: "UNVERIFIABLE", message: error ?? "Metadata metode belum dapat dibaca.", readAt: new Date().toISOString() };
    return { configId: config.id, campaignId: config.campaignId, blacklist: record.blacklist, whitelist: record.whitelist, application };
  });
  const completed = offset + readCount;
  return { lists, continuation: completed < physical.length ? { after: ids[readCount - 1], scope } : null,
    progress: { completed, total: physical.length } };
}
