import "server-only";

import { parseShopeeAccountId } from "./config-input";
import type { CampaignPlacementLists, PlacementListKind, PlacementListRead } from "./placement-list-types";

type Config = { id: number; shopeeAccountId: number; campaignId: string };
type Dependencies = {
  loadConfigs(accountId: number): Promise<Config[]>;
  loadCredential(accountId: number): Promise<{ shopeeAccountId: number; provider: string; encryptedSecret: string } | null>;
  decrypt(secret: string): string;
};

function unavailable(message: string): PlacementListRead {
  return { status: "UNAVAILABLE", message, attemptedAt: new Date().toISOString() };
}

function parseListCount(body: unknown, kind: PlacementListKind): number {
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
  return unique.size;
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
    const count = parseListCount(body, kind);
    if (signal.aborted) throw new Error("TIMEOUT");
    return { status: "SUCCESS", count, readAt: new Date().toISOString() };
  } catch {
    return { status: "ERROR", message: signal.aborted
      ? "Pembacaan melewati batas waktu. Silakan refresh."
      : "Daftar gagal dimuat atau respons API tidak valid.", attemptedAt: new Date().toISOString() };
  }
}

// All jobs in one account read share two workers, not two requests per campaign.
// The action's signal also prevents late SELECT results scheduling new requests.
export async function loadAdsterraPlacementLists(
  input: unknown, deps: Dependencies, budget: AbortSignal, deadlineAt = Date.now() + 45_000,
): Promise<CampaignPlacementLists[]> {
  const accountId = parseShopeeAccountId(input);
  const configs = await deps.loadConfigs(accountId);
  if (budget.aborted) throw new Error("BUDGET_EXHAUSTED");
  if (configs.some((config) => config.shopeeAccountId !== accountId)) throw new Error("CONFIG_SCOPE_MISMATCH");
  if (!configs.length) return [];
  const credential = await deps.loadCredential(accountId);
  if (budget.aborted) throw new Error("BUDGET_EXHAUSTED");
  if (credential && (credential.shopeeAccountId !== accountId || credential.provider !== "ADSTERRA")) throw new Error("CREDENTIAL_SCOPE_MISMATCH");
  const initial = unavailable(credential ? "Belum dibaca." : "Koneksi Adsterra belum dikonfigurasi.");
  const results = configs.map((config) => ({ configId: config.id, campaignId: config.campaignId, blacklist: initial, whitelist: initial }));
  if (!credential) return results;
  const token = deps.decrypt(credential.encryptedSecret);
  // Leave time for returning independently completed lists before the action's
  // hard deadline. Never discard successes merely because later jobs timed out.
  const remainingMs = Math.min(30_000, deadlineAt - Date.now() - 1_000);
  if (remainingMs <= 0) {
    const expired = unavailable("Batas waktu pembacaan tercapai. Silakan refresh.");
    return results.map((result) => ({ ...result, blacklist: expired, whitelist: expired }));
  }
  const providerBudget = AbortSignal.any([budget, AbortSignal.timeout(remainingMs)]);
  const jobs = configs.flatMap((config, index) => (["blacklist", "whitelist"] as const).map((kind) => ({ config, index, kind })));
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const { config, index, kind } = jobs[cursor++];
      if (!/^[1-9]\d*$/.test(config.campaignId) || !Number.isSafeInteger(Number(config.campaignId))) {
        results[index][kind] = unavailable("Campaign ID pada konfigurasi tidak valid.");
      } else {
        results[index][kind] = await readList(config.campaignId, kind, token, providerBudget);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, jobs.length) }, () => worker()));
  return results;
}
