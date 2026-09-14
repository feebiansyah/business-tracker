import Decimal from "decimal.js";

import type { ClickaduStatisticsInput, ClickaduZoneStatistic } from "./types.ts";

const CLICKADU_STATISTICS_URL = "https://ssp.clickadu.com/v1.0/api/client/statistics/";
const PAGE_LIMIT = 100;
const MAX_PAGES = 1_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type ClickaduClientOptions = {
  token: string;
  fetchImpl?: FetchImplementation;
};

type UnknownRecord = Record<string, unknown>;

export class ClickaduApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClickaduApiError";
  }
}
export class ClickaduClient {
  private readonly token: string;
  private readonly fetchImpl: FetchImplementation;

  constructor({ token, fetchImpl = fetch }: ClickaduClientOptions) {
    const normalizedToken = token.trim();
    if (!normalizedToken) throw new ClickaduApiError("Token Clickadu belum dikonfigurasi.");
    this.token = normalizedToken;
    this.fetchImpl = fetchImpl;
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
    } while (page <= totalPages);

    return items;
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

    if (!response.ok) throw new ClickaduApiError(`Request Clickadu gagal (HTTP ${response.status}).`);

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ClickaduApiError("Clickadu API mengembalikan respons tidak valid.");
    }

    return parsePage(body, page);
  }
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

  return { items: result.items.map(parseStatistic), totalPages };
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
