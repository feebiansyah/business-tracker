import Decimal from "decimal.js";
import type { AdsterraPlacementStatistic, AdsterraStatisticsInput } from "./types.ts";

const STATS_URL = "https://api3.adsterratools.com/advertiser/stats.json";
type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class AdsterraApiError extends Error { constructor(message: string) { super(message); this.name = "AdsterraApiError"; } }

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
