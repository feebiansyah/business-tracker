import { AdsterraClient } from "../adsterra-roi/client";
import { campaignKey, sortedIds } from "./canonical";
import { OperationError, type ListKind, type Snapshot } from "./types";
import type { OperationBudget } from "./budget";
import { MarkerPersistenceUncertain, type CampaignOperationStore, type Fence, type WriteMarker } from "./repository";

const base = "https://api3.adsterratools.com/advertiser";
export function parseCampaignInfo(data: unknown, expectedId: string): Snapshot["campaign"] {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new OperationError("Identitas campaign API tidak tersedia.");
  const r = data as Record<string, unknown>;
  if (campaignKey(String(r.id)) !== expectedId || ![1, 2, 3, 4].includes(r.active as number)) throw new OperationError("Identitas/status campaign API belum terbukti.");
  return { id: expectedId, active: r.active as 1 | 2 | 3 | 4, pricing: typeof r.pricing_type === "string" && r.pricing_type.trim() ? r.pricing_type.toUpperCase() : "UNKNOWN" };
}
export function parsePlacementList(body: unknown, kind: ListKind): string[] {
  const raw = kind === "BLACKLIST" && Array.isArray(body) && body.length === 0 ? body
    : body && typeof body === "object" && !Array.isArray(body) && !("error" in body) && !("errors" in body)
      ? (body as Record<string, unknown>).placement_ids : null;
  if (!Array.isArray(raw) || raw.length > 20_000) throw new OperationError("Daftar API tidak valid/tidak lengkap; bukan berarti kosong.");
  const ids = raw.map((value) => {
    if ((typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value))) && Number.isSafeInteger(Number(value)) && Number(value) > 0) return String(Number(value));
    if (kind === "BLACKLIST" && typeof value === "string" && /^[a-zA-Z0-9]{32}$/.test(value)) return value;
    throw new OperationError("Identitas placement API tidak valid.");
  });
  if (new Set(ids).size !== ids.length) throw new OperationError("Daftar API mengandung ID duplikat.");
  return sortedIds(ids);
}
export class PlacementProvider {
  readonly legacy: AdsterraClient;
  fence?: Fence;
  expiresAt?: number;
  requireInactive = false;
  sent = 0;
  ambiguous = false;
  notDispatchedStatus: "PARTIAL" | "RECONFIRM_REQUIRED" | null = null;
  readonly warnings: string[] = [];
  beforeMutation?: () => Promise<void>;
  constructor(private readonly token: string, private readonly campaignId: string, private readonly budget: OperationBudget,
    private readonly store: CampaignOperationStore, private readonly fetcher: typeof fetch = fetch) {
    campaignKey(campaignId);
    this.legacy = new AdsterraClient({ apiKey: token, fetchImpl: this.transport });
  }
  private transport: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.origin !== "https://api3.adsterratools.com" || !url.pathname.startsWith("/advertiser/")) throw new OperationError("Endpoint Adsterra tidak diizinkan.");
    const write = init.method !== undefined && init.method !== "GET";
    let marker: WriteMarker | undefined;
    let dispatched = false;
    let response: Response;
    try {
      if (write) {
        if (this.notDispatchedStatus) throw new OperationError("Operasi sudah dihentikan sebelum dispatch; tidak meneruskan write lain.");
        if (!this.fence) throw new OperationError("Mutasi tanpa guard ditolak.");
        this.budget.check(20_000);
        await this.beforeMutation?.();
        if (this.expiresAt !== undefined && this.budget.now() >= this.expiresAt) throw new OperationError("Konfirmasi kedaluwarsa sebelum mutasi. Tidak meneruskan write.");
        const phase = url.pathname.includes("custom_bid") ? `CUSTOM_BID_${init.method}`
          : url.pathname.includes("linking") ? `${init.method === "POST" ? "CLEAR" : "PUT"}_${url.pathname.includes("blacklist") ? "BLACKLIST" : "WHITELIST"}` : "CAMPAIGN_STATUS_WRITE";
        marker = await this.store.beforeWrite(this.fence, phase);
        // Recheck scope/Auto after the database await too. No write continuation
        // survives a changed generation (including a concurrent Auto disable).
        await this.beforeMutation?.();
        await this.store.dispatchAllowed(this.fence);
        this.budget.check(20_000);
        if (this.expiresAt !== undefined && this.budget.now() >= this.expiresAt) throw new OperationError("Konfirmasi kedaluwarsa sebelum dispatch.");
      }
      response = await this.budget.request(input, init, (request, options) => {
        // Count only actual entry into HTTP transport, not failed local validation.
        if (write) { this.store.markDispatched(marker!); dispatched = true; this.sent++; }
        return this.fetcher(request, options);
      });
    } catch (error) {
      if (write && dispatched) {
        this.ambiguous = true;
        throw new OperationError("Request write terkirim/belum pasti; tidak diulang otomatis.");
      }
      if (write && error instanceof MarkerPersistenceUncertain) this.ambiguous = true;
      if (write && marker) {
        // Only this awaited marker receipt plus no transport entry permits CAS
        // settlement. No GET, pending DB query, or changed fence is proof.
        try { this.notDispatchedStatus = await this.store.settleNotDispatched(marker, this.sent > 0); }
        catch { this.ambiguous = true; throw new OperationError("HTTP belum dimulai, tetapi penyelesaian marker DB/fencing belum pasti. Guard tetap diblokir."); }
      }
      throw error instanceof OperationError ? error : new OperationError(write ? "Validasi sebelum dispatch gagal; write tidak dikirim." : "GET Adsterra gagal/timeout.");
    }
    if (write) {
      // A response arrived. A 4xx still needs GET verification of partial effects.
      await this.store.acknowledged(this.fence!);
      if (!response.ok) this.warnings.push(`Write menerima HTTP ${response.status}; hasil dinilai melalui GET, bukan asumsi sukses/gagal.`);
    }
    return response;
  };
  private async call(path: string, method = "GET", payload?: object) {
    const response = await this.transport(`${base}${path}`, { method, headers: { "X-API-Key": this.token, Accept: "application/json", ...(payload ? { "Content-Type": "application/json" } : {}) }, body: payload ? JSON.stringify(payload) : undefined });
    if (!response.ok) throw new OperationError(`API Adsterra HTTP ${response.status}.`);
    if (response.status === 204) throw new OperationError("API tidak mengembalikan bukti daftar; bukan daftar kosong.");
    try { return await response.json() as unknown; } catch { throw new OperationError("Respons API Adsterra tidak valid."); }
  }
  async campaign(): Promise<Snapshot["campaign"]> {
    return parseCampaignInfo(await this.call(`/campaign/${this.campaignId}.json`), this.campaignId);
  }
  bidClient() {
    const scoped = (id: string) => { if (campaignKey(id) !== this.campaignId) throw new OperationError("Scope write Custom Bid berbeda dari guard."); return this.campaignId; };
    return {
      getBlacklist: async (id: string) => {
        scoped(id);
        const ids = await this.list("BLACKLIST");
        if (ids.some((id) => !/^\d+$/.test(id))) throw new OperationError("Blacklist mempunyai identitas nonnumerik; write Custom Bid diblokir untuk pemeriksaan manual.");
        return ids.map(Number);
      },
      getCustomBids: (id: string) => this.legacy.getCustomBids(scoped(id)),
      setCustomBids: (id: string, bids: Parameters<AdsterraClient["setCustomBids"]>[1]) => this.legacy.setCustomBids(scoped(id), bids),
      updateCustomBids: (id: string, bids: Parameters<AdsterraClient["updateCustomBids"]>[1]) => this.legacy.updateCustomBids(scoped(id), bids),
      deleteCustomBids: (id: string, bids: Parameters<AdsterraClient["deleteCustomBids"]>[1]) => this.legacy.deleteCustomBids(scoped(id), bids),
    };
  }
  async list(kind: ListKind) { return parsePlacementList(await this.call(`/campaign/${this.campaignId}/linking/${kind.toLowerCase()}.json`), kind); }
  async clear(kind: ListKind) {
    const data = kind === "BLACKLIST"
      ? await this.call("/linking/blacklist/clean.json", "POST", { campaign_id: Number(this.campaignId) })
      : await this.call(`/campaign/${this.campaignId}/linking/whitelist.json`, "POST");
    if (kind === "WHITELIST") parsePlacementList(data, kind);
    else if (!data || typeof data !== "object" || Array.isArray(data)
      || !Number.isSafeInteger((data as Record<string, unknown>).processedPairsCount)
      || !Array.isArray((data as Record<string, unknown>).unprocessedPairs)) throw new OperationError("Respons clear blacklist belum valid; periksa GET.");
  }
  async put(kind: ListKind, ids: string[]) {
    const data = await this.call(`/linking/${kind.toLowerCase()}.json`, "PUT", { campaign_id: Number(this.campaignId), placement_ids: ids.map((id) => /^\d+$/.test(id) ? Number(id) : id) });
    parsePlacementList(data, kind); // GET of BOTH lists is still mandatory
  }
}
