import Decimal from "decimal.js";
import type { AdsterraPlacementStatistic, AdsterraStatisticsInput } from "./types.ts";

const STATS_URL = "https://api3.adsterratools.com/advertiser/stats.json";
const API_BASE_URL = "https://api3.adsterratools.com/advertiser";
type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class AdsterraApiError extends Error { constructor(message: string) { super(message); this.name = "AdsterraApiError"; } }
export class AdsterraAmbiguousWriteError extends Error { constructor() { super("Status update Adsterra tidak dapat dipastikan."); this.name = "AdsterraAmbiguousWriteError"; } }
export type AdsterraCampaignStatus = "INACTIVE" | "LIMITED" | "ACTIVE" | "NOT_IN_USE";
export type AdsterraCampaignStatusResult = { campaignId: number; activeCode: 1 | 2 | 3 | 4; status: AdsterraCampaignStatus };

export class AdsterraClient {
  private readonly apiKey: string;
  private readonly fetchImpl: FetchImplementation;
  constructor({ apiKey, fetchImpl = fetch }: { apiKey: string; fetchImpl?: FetchImplementation }) {
    this.apiKey = apiKey.trim(); this.fetchImpl = fetchImpl;
    if (!this.apiKey) throw new AdsterraApiError("API Key Adsterra belum dikonfigurasi.");
  }
  async getPlacementStatistics(input: AdsterraStatisticsInput) {
    const url = new URL(STATS_URL);
    url.searchParams.set("start_date", input.dateFrom); url.searchParams.set("finish_date", input.dateTill);
    url.searchParams.append("group_by[]", "placement"); url.searchParams.set("campaign", input.campaignId.trim());
    let response: Response;
    try { response = await this.fetchImpl(url, { method: "GET", headers: { "X-API-Key": this.apiKey }, cache: "no-store" }); }
    catch { throw new AdsterraApiError("Tidak dapat menghubungi Adsterra API."); }
    if (!response.ok) throw new AdsterraApiError(`Request Adsterra gagal (HTTP ${response.status}).`);
    let body: unknown;
    try { body = await response.json(); } catch { throw new AdsterraApiError("Adsterra API mengembalikan respons tidak valid."); }
    return parseResponse(body);
  }
  async getBlacklist(campaignIdValue: string) {
    const campaignId = positiveInteger(campaignIdValue, "Campaign ID");
    const body = await this.fetchJson(`${API_BASE_URL}/campaign/${campaignId}/linking/blacklist.json`, "GET");
    return parseBlacklist(body);
  }
  async getCampaignStatus(campaignIdValue: string): Promise<AdsterraCampaignStatusResult> {
    const campaignId = positiveInteger(campaignIdValue, "Campaign ID");
    const body = await this.fetchJson(`${API_BASE_URL}/campaign/${campaignId}.json`, "GET", undefined, true);
    return parseCampaignStatus(campaignId, body);
  }
  async setCampaignActive(campaignIdValue: string, active: boolean) {
    const campaignId = positiveInteger(campaignIdValue, "Campaign ID");
    if (typeof active !== "boolean") throw new AdsterraApiError("Status campaign Adsterra tidak valid.");
    await this.fetchJson(`${API_BASE_URL}/campaign/${campaignId}.json`, "PATCH", { active }, true);
  }
  async replaceBlacklist(campaignIdValue: string, placementIdValues: readonly unknown[]) {
    const campaignId = positiveInteger(campaignIdValue, "Campaign ID");
    const placementIds = normalizePlacementIds(placementIdValues);
    try {
      await this.fetchJson(`${API_BASE_URL}/linking/blacklist.json`, "PUT", { campaign_id: campaignId, placement_ids: placementIds });
    } catch (error) {
      if (error instanceof AdsterraApiError) throw error;
      throw new AdsterraAmbiguousWriteError();
    }
  }
  private async fetchJson(url: string, method: "GET" | "PUT" | "PATCH", payload?: Record<string, unknown>, acceptJson = false) {
    let response: Response;
    try {
      response = await this.fetchImpl(url, { method, headers: { "X-API-Key": this.apiKey, ...(acceptJson ? { Accept: "application/json" } : {}), ...(payload ? { "Content-Type": "application/json" } : {}) }, body: payload ? JSON.stringify(payload) : undefined, cache: "no-store" });
    } catch {
      if (method === "PUT" || method === "PATCH") throw new AdsterraAmbiguousWriteError();
      throw new AdsterraApiError("Tidak dapat menghubungi Adsterra API.");
    }
    if (!response.ok) throw new AdsterraApiError(`Request Adsterra gagal (HTTP ${response.status}).`);
    if (method === "PUT" || method === "PATCH") return {};
    if (response.status === 204) return [];
    try { return await response.json(); } catch { throw new AdsterraApiError("Adsterra API mengembalikan respons tidak valid."); }
  }
}

function parseCampaignStatus(campaignId: number, body: unknown): AdsterraCampaignStatusResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new AdsterraApiError("Adsterra API mengembalikan status campaign tidak valid.");
  const active = (body as Record<string, unknown>).active;
  const statuses: Record<number, AdsterraCampaignStatus> = { 1: "INACTIVE", 2: "LIMITED", 3: "ACTIVE", 4: "NOT_IN_USE" };
  if (typeof active !== "number" || !Number.isInteger(active) || !(active in statuses)) throw new AdsterraApiError("Adsterra API mengembalikan status campaign tidak valid.");
  return { campaignId, activeCode: active as 1 | 2 | 3 | 4, status: statuses[active] };
}

export function normalizePlacementIds(values: readonly unknown[]) {
  const result: number[] = []; const seen = new Set<number>();
  for (const value of values) { const placement = positiveInteger(value, "Placement ID"); if (!seen.has(placement)) { seen.add(placement); result.push(placement); } }
  return result;
}

function parseBlacklist(body: unknown) {
  if (Array.isArray(body)) return normalizePlacementIds(body);
  if (!body || typeof body !== "object") throw new AdsterraApiError("Adsterra API mengembalikan respons blacklist tidak valid.");
  const placementIds = (body as Record<string, unknown>).placement_ids;
  if (!Array.isArray(placementIds)) throw new AdsterraApiError("Adsterra API mengembalikan respons blacklist tidak valid.");
  return normalizePlacementIds(placementIds);
}

function positiveInteger(value: unknown, label: string) {
  const parsed = typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value.trim()) : value;
  if (!Number.isSafeInteger(parsed) || (parsed as number) <= 0) throw new AdsterraApiError(`${label} Adsterra tidak valid.`);
  return parsed as number;
}

function parseResponse(body: unknown): AdsterraPlacementStatistic[] {
  if (!body || typeof body !== "object" || Array.isArray(body) || !Array.isArray((body as Record<string, unknown>).items)) throw new AdsterraApiError("Adsterra API mengembalikan respons tidak valid.");
  return ((body as Record<string, unknown>).items as unknown[]).map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new AdsterraApiError("Adsterra API mengembalikan statistik tidak valid.");
    const item = value as Record<string, unknown>; const placement = stringId(item.placement);
    return { placement, impressions: count(item.impressions, "impressions"), clicks: count(item.clicks, "clicks"), spent: money(item.spent) };
  });
}
function stringId(value: unknown) { if (typeof value !== "string" && typeof value !== "number") throw new AdsterraApiError("Adsterra API mengembalikan placement tidak valid."); const id = String(value).trim(); if (!id) throw new AdsterraApiError("Adsterra API mengembalikan placement tidak valid."); return id; }
function count(value: unknown, field: string) { const parsed = typeof value === "string" ? Number(value) : value; if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed < 0) throw new AdsterraApiError(`Adsterra API mengembalikan ${field} tidak valid.`); return parsed; }
function money(value: unknown) { try { const parsed = new Decimal(String(value)); if (!parsed.isFinite() || parsed.isNegative()) throw new Error(); return parsed.toString(); } catch { throw new AdsterraApiError("Adsterra API mengembalikan spent tidak valid."); } }
