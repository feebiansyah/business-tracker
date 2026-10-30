import { AdsterraClient } from "../adsterra-roi/client";
import { campaignKey, sortedIds } from "./canonical";
import { OperationError, type ListKind, type Snapshot, type WhitelistRejection } from "./types";
import { parseWhitelistRejection } from "./whitelist-rejections";
import type { OperationBudget } from "./budget";
import { ProviderBodyLimitError, ProviderResponseReadError } from "./budget";
import { diagnosticStage, diagnosticText, providerReasons, rejectedPlacements, type OperationDiagnostic } from "./diagnostics";
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
  readonly diagnostics: OperationDiagnostic[] = [];
  whitelistRejection?: WhitelistRejection;
  recordDiagnostic(entry: OperationDiagnostic) {
    if (this.diagnostics.length < 4 && !this.diagnostics.some((e) => JSON.stringify(e) === JSON.stringify(entry))) this.diagnostics.push(entry);
  }
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
    const stage = diagnosticStage(url.pathname, init.method ?? "GET");
    let marker: WriteMarker | undefined;
    let dispatched = false;
    let response: Response;
    try {
      if (write) {
        if (this.ambiguous) throw new OperationError("Hasil request sebelumnya belum pasti; tidak meneruskan write lain.");
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
      if (dispatched || !write) this.recordDiagnostic({ stage, kind: error instanceof ProviderBodyLimitError ? "BODY_LIMIT" : "REQUEST_INCOMPLETE",
        httpStatus: error instanceof ProviderResponseReadError ? error.httpStatus : null,
        reasons: [error instanceof ProviderBodyLimitError ? "Response body limit exceeded" : "Request did not complete"] });
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
    if (!response.ok) {
      let body: unknown;
      try { body = JSON.parse(await response.clone().text()); } catch { /* Never expose raw/invalid error bodies. */ }
      let confirmed: string[] = [];
      if (init.method === "PUT" && url.pathname.includes("/linking/")) {
        try { const payload = JSON.parse(String(init.body)); if (Array.isArray(payload.placement_ids)) confirmed = payload.placement_ids.map(String); } catch { /* Only known PUT payloads authorize diagnostics IDs. */ }
      }
      if (stage === "PUT_WHITELIST" && response.status === 422) this.whitelistRejection = parseWhitelistRejection(body, confirmed);
      this.recordDiagnostic({ stage, kind: "HTTP_ERROR", httpStatus: response.status, reasons: providerReasons(body), rejected: this.whitelistRejection
        ? this.whitelistRejection.groups.slice(0, 4).map((g) => ({ reason: g.reason, placementIds: g.ids.slice(0, 5) })) : rejectedPlacements(body, confirmed) });
    }
    if (write) {
      // A response arrived. A 4xx still needs GET verification of partial effects.
      try { await this.store.acknowledged(this.fence!); }
      catch (error) { this.ambiguous = true; throw error; }
      if (!response.ok) this.warnings.push(`${diagnosticText({ stage, kind: "HTTP_ERROR", httpStatus: response.status, reasons: this.diagnostics.find((e) => e.stage === stage && e.httpStatus === response.status)?.reasons ?? ["Provider reason unavailable"] })}. Hasil dinilai melalui GET, tanpa retry write.`);
    }
    return response;
  };
  private async call<T = unknown>(path: string, method = "GET", payload?: object, parse?: (body: unknown) => T): Promise<T> {
    const response = await this.transport(`${base}${path}`, { method, headers: { "X-API-Key": this.token, Accept: "application/json", ...(payload ? { "Content-Type": "application/json" } : {}) }, body: payload ? JSON.stringify(payload) : undefined });
    if (!response.ok) throw new OperationError(`API Adsterra HTTP ${response.status}.`);
    try {
      if (response.status === 204) throw new OperationError("API tidak mengembalikan bukti daftar; bukan daftar kosong.");
      const body: unknown = await response.json();
      return parse ? parse(body) : body as T;
    } catch (error) {
      this.recordDiagnostic({ stage: diagnosticStage(path, method), kind: "INVALID_RESPONSE", httpStatus: response.status, reasons: ["Invalid API response"] });
      if (error instanceof OperationError) throw error;
      throw new OperationError("Respons API Adsterra tidak valid; bukan bukti daftar kosong.");
    }
  }
  async campaign(): Promise<Snapshot["campaign"]> {
    return this.call(`/campaign/${this.campaignId}.json`, "GET", undefined, (body) => parseCampaignInfo(body, this.campaignId));
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
  async list(kind: ListKind) { return this.call(`/campaign/${this.campaignId}/linking/${kind.toLowerCase()}.json`, "GET", undefined, (body) => parsePlacementList(body, kind)); }
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
    await this.call(`/linking/${kind.toLowerCase()}.json`, "PUT", { campaign_id: Number(this.campaignId), placement_ids: ids.map((id) => /^\d+$/.test(id) ? Number(id) : id) }, (body) => parsePlacementList(body, kind)); // GET of BOTH lists is still mandatory
  }
}
