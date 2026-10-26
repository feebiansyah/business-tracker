import Decimal from "decimal.js";
import { ClickaduApiError } from "../clickadu-roi/client.ts";
import type { ClickaduStatisticsInput } from "../clickadu-roi/types.ts";

type RecordValue = Record<string, unknown>;
const BASE_URL = "https://ssp.clickadu.com";
const PAGE_SIZE = 100;
const MAX_PAGES = 1_000;

// Daily-history adapter only. Zone analysis/blacklist keep their existing client.
export class ClickaduDailyHistoryClient {
  private readonly token: string;

  constructor(token: string) {
    this.token = token.trim();
    if (!this.token) throw new ClickaduApiError("Koneksi Clickadu belum dikonfigurasi.");
  }

  async getStatistics(input: ClickaduStatisticsInput): Promise<{ spent: string }[]> {
    if (input.campaignIds.length !== 1) throw new ClickaduApiError("Sync harian memerlukan satu campaign.");
    const campaignId = validCampaignId(input.campaignIds[0]);
    const date = input.dateFrom;
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (input.dateTill !== date || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      throw new ClickaduApiError("Tanggal laporan harian Clickadu tidak valid.");
    }
    const url = new URL("/v1.0/api/client/statistics/", BASE_URL);
    url.searchParams.set("dateFrom", date);
    url.searchParams.set("dateTill", date);
    url.searchParams.set("groupBy", "date");
    url.searchParams.append("campaignId[]", campaignId);
    url.searchParams.set("timezone", "Asia/Bangkok");
    url.searchParams.set("withTestExpenses", "1");
    url.searchParams.set("limit", String(PAGE_SIZE));

    return this.read(async (get) => {
      let pages: number | null = null;
      let spend: Decimal | null = null;
      let total: Decimal | null = null;
      for (let page = 1; page <= (pages ?? 1); page++) {
        url.searchParams.set("page", String(page));
        const result = record(record(await get(url)).result);
        // Observed empty reports can contain items: [] with no pagination/totals.
        // This is UNKNOWN, not page 0/1 and not a verified zero-spend date.
        if (Array.isArray(result.items) && result.items.length === 0) {
          throw new ClickaduApiError("Data harian Clickadu belum tersedia; spend dan checkpoint tanggal ini tidak diubah.");
        }
        const reportedPages = pageNumber(result.totalPages);
        if (pageNumber(result.page) !== page || result.perPage !== String(PAGE_SIZE)
          || page > reportedPages || (pages !== null && pages !== reportedPages)) throw invalidResponse();
        pages = reportedPages;
        if (!Array.isArray(result.items) || result.items.length > PAGE_SIZE
          || (page < pages && result.items.length !== PAGE_SIZE)) throw invalidResponse();
        const reportedTotal = money(record(result.totals).spent);
        if (total !== null && !total.eq(reportedTotal)) throw invalidResponse();
        total = reportedTotal;
        for (const item of result.items) {
          const row = record(item);
          // A single day grouped only by date has one unique dated aggregate.
          if (row.date !== date || spend !== null) throw invalidResponse();
          spend = money(row.spent);
        }
      }
      // Verify totals without adding them again to the dated detail row.
      if (spend === null || total === null || !spend.eq(total)) throw invalidResponse();
      return [{ spent: spend.toString() }];
    });
  }

  async getCampaign(campaignId: string): Promise<RecordValue> {
    const id = validCampaignId(campaignId);
    return this.read(async (get) => {
      const body = record(await get(new URL(`/api/v2/campaigns/${encodeURIComponent(id)}/`, BASE_URL)));
      const campaign = "result" in body ? record(body.result) : body;
      if (String(campaign.id) !== id) throw new ClickaduApiError("Scope campaign Clickadu tidak sesuai.");
      const amount = campaign.dailyAmount;
      return { id, dailyAmount: amount === undefined || amount === null || amount === "" ? null : money(amount).toString() };
    });
  }

  private async read<T>(work: (get: (url: URL) => Promise<unknown>) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      // Includes every page, body read and the bounded rate-limit retry.
      timer = setTimeout(() => { reject(new ClickaduApiError("Pengambilan laporan harian Clickadu melewati batas waktu.")); controller.abort(); }, 30_000);
    });
    const get = async (url: URL): Promise<unknown> => {
      for (let attempt = 0; attempt < 2; attempt++) {
        controller.signal.throwIfAborted();
        const response = await fetch(url, {
          method: "GET", cache: "no-store", redirect: "error", signal: controller.signal,
          headers: { Accept: "application/json", Authorization: this.token },
        });
        if (response.status === 429) {
          await response.body?.cancel();
          const retryAfter = response.headers.get("Retry-After");
          const seconds = retryAfter === null ? 0.5 : /^\d+(?:\.\d+)?$/.test(retryAfter.trim()) ? Number(retryAfter) : NaN;
          if (attempt === 1 || !Number.isFinite(seconds) || seconds > 2) {
            throw new ClickaduApiError("Rate limit Clickadu tercapai. Coba Sync lagi beberapa saat.");
          }
          await new Promise((resolve) => setTimeout(resolve, Math.max(500, seconds * 1_000)));
          continue;
        }
        if (!response.ok) throw new ClickaduApiError(`GET laporan harian Clickadu gagal (HTTP ${response.status}).`);
        return exactJson(await response.text());
      }
      throw new ClickaduApiError("Rate limit Clickadu tercapai.");
    };
    try { return await Promise.race([work(get), timeout]); }
    catch (error) {
      if (error instanceof ClickaduApiError) throw error;
      // No raw body, credential, request header or network error reaches the UI.
      throw new ClickaduApiError("Laporan harian Clickadu gagal dimuat atau respons tidak valid.");
    } finally { clearTimeout(timer); }
  }
}

function invalidResponse() { return new ClickaduApiError("Tanggal, pagination, spend, atau kelengkapan laporan harian Clickadu tidak valid."); }
function record(value: unknown): RecordValue {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw invalidResponse();
  return value as RecordValue;
}
function validCampaignId(value: string) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 64) throw new ClickaduApiError("Campaign Clickadu tidak valid.");
  return value.trim();
}
function pageNumber(value: unknown) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) throw invalidResponse();
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result > MAX_PAGES) throw invalidResponse();
  return result;
}
function money(value: unknown) {
  if (typeof value !== "string" || !/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) throw invalidResponse();
  const result = new Decimal(value.trim());
  if (!result.isFinite() || result.isNegative()) throw invalidResponse();
  return result;
}
function exactJson(text: string): unknown {
  JSON.parse(text);
  // Preserve numeric lexemes before JSON.parse rounds money to binary floats.
  return JSON.parse(text.replace(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, (token) => {
    if (token.startsWith('"')) return token;
    if (!Number.isFinite(Number(token))) throw invalidResponse();
    return JSON.stringify(token);
  }));
}
