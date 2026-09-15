import Decimal from "decimal.js";

import type { ClickaduStatisticsInput, ClickaduZoneStatistic } from "./types.ts";

const CLICKADU_STATISTICS_URL = "https://ssp.clickadu.com/v1.0/api/client/statistics/";
const CLICKADU_BASE_URL = "https://ssp.clickadu.com";
const PAGE_LIMIT = 100;
const MAX_PAGES = 1_000;
const MAX_ATTEMPTS_PER_PAGE = 3;
const INITIAL_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 10_000;
const INTER_PAGE_DELAY_MS = 150;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type SleepImplementation = (milliseconds: number) => Promise<void>;

type ClickaduClientOptions = {
  token: string;
  fetchImpl?: FetchImplementation;
  sleepImpl?: SleepImplementation;
};

type UnknownRecord = Record<string, unknown>;

export class ClickaduApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClickaduApiError";
  }
}
export class ClickaduAmbiguousWriteError extends Error {
  constructor() {
    super("Status update Clickadu tidak dapat dipastikan.");
    this.name = "ClickaduAmbiguousWriteError";
  }
}
export class ClickaduClient {
  private readonly token: string;
  private readonly fetchImpl: FetchImplementation;
  private readonly sleepImpl: SleepImplementation;

  constructor({ token, fetchImpl = fetch, sleepImpl = sleep }: ClickaduClientOptions) {
    const normalizedToken = token.trim();
    if (!normalizedToken) throw new ClickaduApiError("Token Clickadu belum dikonfigurasi.");
    this.token = normalizedToken;
    this.fetchImpl = fetchImpl;
    this.sleepImpl = sleepImpl;
  }

  async getZoneStatistics(input: ClickaduStatisticsInput): Promise<ClickaduZoneStatistic[]> {
    validateInput(input);

    const items: ClickaduZoneStatistic[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const payload = await this.fetchPage(input, page);
      items.push(...payload.items);
      totalPages = payload.totalPages;
      page += 1;
      if (page <= totalPages) await this.sleepImpl(INTER_PAGE_DELAY_MS);
    } while (page <= totalPages);

    return items;
  }

  async getCampaign(campaignId: string): Promise<UnknownRecord> {
    const body = await this.fetchJson(this.campaignUrl(campaignId), "GET");
    const response = asRecord(body, "response");
    return "result" in response ? asRecord(response.result, "campaign") : response;
  }

  async getBlockedZones(campaignId: string): Promise<string[]> {
    const body = await this.fetchJson(`${CLICKADU_BASE_URL}/v1.0/api/client/campaigns/${encodeURIComponent(validateCampaignId(campaignId))}/blocked/zone/`, "GET");
    return parseBlockedZones(body);
  }

  async updateCampaign(campaignId: string, payload: UnknownRecord): Promise<void> {
    try {
      await this.fetchJson(this.campaignUrl(campaignId), "PUT", payload, false);
    } catch (error) {
      if (error instanceof ClickaduApiError) throw error;
      throw new ClickaduAmbiguousWriteError();
    }
  }

  private campaignUrl(campaignId: string) {
    return `${CLICKADU_BASE_URL}/api/v2/campaigns/${encodeURIComponent(validateCampaignId(campaignId))}/`;
  }

  private async fetchJson(url: string, method: "GET" | "PUT", payload?: UnknownRecord, retry429 = true): Promise<unknown> {
    const attempts = retry429 ? MAX_ATTEMPTS_PER_PAGE : 1;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method,
          headers: { Authorization: this.token, ...(payload ? { "Content-Type": "application/json" } : {}) },
          body: payload ? JSON.stringify(payload) : undefined,
          cache: "no-store",
        });
      } catch {
        if (method === "PUT") throw new ClickaduAmbiguousWriteError();
        throw new ClickaduApiError("Tidak dapat menghubungi Clickadu API.");
      }
      if (response.status === 429 && retry429) {
        if (attempt === attempts) throw new ClickaduApiError("Rate limit Clickadu tercapai. Coba lagi beberapa saat.");
        await this.sleepImpl(getRetryDelayMs(response.headers.get("Retry-After"), attempt));
        continue;
      }
      if (!response.ok) throw new ClickaduApiError(`Request Clickadu gagal (HTTP ${response.status}).`);
      if (method === "PUT") return {};
      if (response.status === 204) return {};
      try { return await response.json(); }
      catch { throw new ClickaduApiError("Clickadu API mengembalikan respons tidak valid."); }
    }
    throw new ClickaduApiError("Request Clickadu gagal.");
  }

  private async fetchPage(input: ClickaduStatisticsInput, page: number) {
    const url = new URL(CLICKADU_STATISTICS_URL);
    url.searchParams.set("dateFrom", input.dateFrom);
    url.searchParams.set("dateTill", input.dateTill);
    url.searchParams.set("groupBy", "zone");
    for (const campaignId of input.campaignIds) url.searchParams.append("campaignId[]", campaignId);
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", String(PAGE_LIMIT));
    url.searchParams.set("withTestExpenses", "0");

    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_PAGE; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: "GET",
          headers: { Authorization: this.token },
          cache: "no-store",
        });
      } catch {
        throw new ClickaduApiError("Tidak dapat menghubungi Clickadu API.");
      }

      if (response.status === 429) {
        if (attempt === MAX_ATTEMPTS_PER_PAGE) {
          throw new ClickaduApiError("Rate limit Clickadu tercapai. Coba lagi beberapa saat.");
        }
        await this.sleepImpl(getRetryDelayMs(response.headers.get("Retry-After"), attempt));
        continue;
      }

      if (!response.ok) throw new ClickaduApiError(`Request Clickadu gagal (HTTP ${response.status}).`);

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new ClickaduApiError("Clickadu API mengembalikan respons tidak valid.");
      }

      return parsePage(body, page);
    }

    throw new ClickaduApiError("Rate limit Clickadu tercapai. Coba lagi beberapa saat.");
  }
}

function validateCampaignId(value: string) {
  const campaignId = value.trim();
  if (!campaignId) throw new ClickaduApiError("Campaign Clickadu tidak valid.");
  return campaignId;
}

function parseBlockedZones(body: unknown) {
  const response = asRecord(body, "response");
  const result = "result" in response ? response.result : response;
  const record = result && typeof result === "object" && !Array.isArray(result) ? result as UnknownRecord : null;
  const list = Array.isArray(result) ? result : Array.isArray(record?.items) ? record.items : Array.isArray(record?.zones) ? record.zones : [];
  return list.map((item) => {
    if (typeof item === "string" || typeof item === "number") return String(item).trim();
    const value = asRecord(item, "blocked zone");
    const zone = value.zone ?? value.id;
    if (typeof zone !== "string" && typeof zone !== "number") throw new ClickaduApiError("Clickadu API mengembalikan blocked zone tidak valid.");
    return String(zone).trim();
  }).filter(Boolean);
}

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function getRetryDelayMs(retryAfter: string | null, attempt: number) {
  if (retryAfter !== null && /^\d+(?:\.\d+)?$/.test(retryAfter.trim())) {
    const milliseconds = Number(retryAfter) * 1_000;
    if (Number.isFinite(milliseconds)) return Math.min(milliseconds, MAX_RETRY_DELAY_MS);
  }
  return INITIAL_RETRY_DELAY_MS * 2 ** (attempt - 1);
}

function validateInput(input: ClickaduStatisticsInput) {
  if (!DATE_PATTERN.test(input.dateFrom) || !DATE_PATTERN.test(input.dateTill)) {
    throw new ClickaduApiError("Rentang tanggal Clickadu tidak valid.");
  }
  if (input.campaignIds.length === 0 || input.campaignIds.some((id) => !id.trim())) {
    throw new ClickaduApiError("Campaign Clickadu tidak valid.");
  }
}

function parsePage(body: unknown, expectedPage: number): { items: ClickaduZoneStatistic[]; totalPages: number } {
  const result = asRecord(asRecord(body, "response").result, "result");
  const page = asInteger(result.page, "page");
  const totalPages = asInteger(result.totalPages, "totalPages", true);
  if (page !== expectedPage || totalPages > MAX_PAGES) {
    throw new ClickaduApiError("Clickadu API mengembalikan pagination tidak valid.");
  }
  if (!Array.isArray(result.items)) throw new ClickaduApiError("Clickadu API mengembalikan items tidak valid.");

  return {
    items: result.items.filter(hasStatisticZone).map(parseStatistic),
    totalPages,
  };
}

function hasStatisticZone(value: unknown) {
  const item = asRecord(value, "item");
  return item.zone !== null && item.zone !== undefined && String(item.zone).trim() !== "";
}

function parseStatistic(value: unknown): ClickaduZoneStatistic {
  const item = asRecord(value, "item");
  const zone = typeof item.zone === "string" || typeof item.zone === "number" ? String(item.zone).trim() : "";
  if (!zone) throw new ClickaduApiError("Clickadu API mengembalikan zone tidak valid.");

  return {
    impressions: asNumber(item.impressions, "impressions"),
    clicks: asNumber(item.clicks, "clicks"),
    conversions: asNumber(item.conversions, "conversions"),
    conversionsClicks: asNumber(item.conversionsClicks, "conversionsClicks"),
    cpa: asDecimalString(item.cpa, "cpa"),
    cpc: asDecimalString(item.cpc, "cpc"),
    cpm: asDecimalString(item.cpm, "cpm"),
    ctr: asDecimalString(item.ctr, "ctr"),
    cr: asDecimalString(item.cr, "cr"),
    spent: asDecimalString(item.spent, "spent"),
    zone,
  };
}

function asRecord(value: unknown, field: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ClickaduApiError(`Clickadu API mengembalikan ${field} tidak valid.`);
  }
  return value as UnknownRecord;
}

function asInteger(value: unknown, field: string, allowZero = false): number {
  if (!Number.isInteger(value) || (value as number) < (allowZero ? 0 : 1)) {
    throw new ClickaduApiError(`Clickadu API mengembalikan ${field} tidak valid.`);
  }
  return value as number;
}

function asNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ClickaduApiError(`Clickadu API mengembalikan ${field} tidak valid.`);
  }
  return value;
}

function asDecimalString(value: unknown, field: string): string {
  if (typeof value !== "number" && typeof value !== "string") {
    throw new ClickaduApiError(`Clickadu API mengembalikan ${field} tidak valid.`);
  }
  try {
    const decimal = new Decimal(String(value));
    if (!decimal.isFinite() || decimal.isNegative()) throw new Error("invalid decimal");
    return decimal.toString();
  } catch {
    throw new ClickaduApiError(`Clickadu API mengembalikan ${field} tidak valid.`);
  }
}
