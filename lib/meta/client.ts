import "server-only";

import { createHmac } from "node:crypto";
import { getMetaConfig, type MetaConfig } from "@/lib/meta/config";
import { accountDailySpendRequest, adSetsRequest, campaignInsightsRequest, campaignsRequest } from "@/lib/meta/campaign-requests";
import type { MetaAccountDailySpend, MetaAdAccount, MetaAdSet, MetaBusiness, MetaCampaign, MetaCampaignInsight, MetaInsightRange } from "@/lib/meta/types";

type MetaPage<T> = {
  data?: T[];
  paging?: { cursors?: { after?: string } };
  error?: { message?: string; code?: number };
};

export type MetaSyncReadKind = "campaigns" | "adSets" | "spend" | "insights";
export type MetaSyncReadOptions = { deadline: number; signal?: AbortSignal; after?: string };
export class MetaSyncPauseError extends Error {
  constructor(readonly reason: "DEADLINE" | "REQUEST_TIMEOUT" | "ABORTED" | "RETRY_AFTER", readonly rateLimited = false) {
    super(rateLimited ? "Sync dijeda karena batas request Meta. Lanjutkan setelah beberapa saat." : "Batas waktu unit Sync tercapai. Progres tersimpan dapat dilanjutkan.");
    this.name = "MetaSyncPauseError";
  }
}

const TEMPORARY_ERROR_CODES = new Set([1, 2, 17, 32, 613]);
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1_000;
const BUSINESS_DELAY_MS = 500;

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class MetaApiError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message);
    this.name = "MetaApiError";
  }
}

export class MetaGraphClient {
  private readonly baseUrl: string;
  private readonly appSecretProof?: string;
  private usagePercent = 0;

  constructor(private readonly config: MetaConfig = getMetaConfig()) {
    this.baseUrl = `https://graph.facebook.com/${config.apiVersion}`;
    this.appSecretProof = config.appSecret
      ? createHmac("sha256", config.appSecret).update(config.accessToken).digest("hex")
      : undefined;
  }

  getBusinesses() {
    return this.getAllPages<MetaBusiness>("/me/businesses", ["id", "name"]);
  }

  getAdAccounts() {
    return this.getAllPages<MetaAdAccount>("/me/adaccounts", ["id", "account_id", "name", "account_status"]);
  }

  async getAdAccountStatus(accountId: string): Promise<number | undefined> {
    const url = new URL(`${this.baseUrl}/act_${encodeURIComponent(accountId)}`);
    url.searchParams.set("fields", "account_status");
    if (this.appSecretProof) url.searchParams.set("appsecret_proof", this.appSecretProof);
    const payload = await this.fetchPage<MetaAdAccount>(url);
    const status = (payload as unknown as MetaAdAccount).account_status;
    return typeof status === "number" ? status : undefined;
  }

  getOwnedAdAccounts(businessId: string) {
    return this.getAllPages<MetaAdAccount>(`/${encodeURIComponent(businessId)}/owned_ad_accounts`, [
      "id",
      "account_id",
      "name",
      "account_status",
    ]);
  }

  getClientAdAccounts(businessId: string) {
    return this.getAllPages<MetaAdAccount>(`/${encodeURIComponent(businessId)}/client_ad_accounts`, [
      "id",
      "account_id",
      "name",
      "account_status",
    ]);
  }

  getCampaigns(accountId: string) {
    const request = campaignsRequest(accountId);
    return this.getAllPages<MetaCampaign>(request.path, request.fields);
  }

  getAdSets(accountId: string) {
    const request = adSetsRequest(accountId);
    return this.getAllPages<MetaAdSet>(request.path, request.fields);
  }

  getCampaignInsights(accountId: string, range: MetaInsightRange) {
    const request = campaignInsightsRequest(accountId, range);
    return this.getAllPages<MetaCampaignInsight>(request.path, request.fields, request.params);
  }

  getAccountDailySpend(accountId: string, range: MetaInsightRange) {
    const request = accountDailySpendRequest(accountId, range);
    return this.getAllPages<MetaAccountDailySpend>(request.path, request.fields, request.params);
  }

  // Opt-in only. Legacy all-page methods below retain their original contract.
  async getSyncAccountStatus(accountId: string, options: MetaSyncReadOptions): Promise<number | undefined> {
    const url = new URL(`${this.baseUrl}/act_${encodeURIComponent(accountId)}`);
    url.searchParams.set("fields", "account_status");
    if (this.appSecretProof) url.searchParams.set("appsecret_proof", this.appSecretProof);
    const payload = await this.fetchSyncPage<MetaAdAccount>(url, options);
    const status = (payload as unknown as MetaAdAccount).account_status;
    return typeof status === "number" ? status : undefined;
  }

  async getSyncPage<T>(kind: MetaSyncReadKind, accountId: string, range: MetaInsightRange | undefined, options: MetaSyncReadOptions): Promise<{ data: T[]; after?: string }> {
    if ((kind === "spend" || kind === "insights") && !range) throw new MetaApiError("Rentang Sync Meta tidak valid.");
    const request: { path: string; fields: string[]; params?: Record<string,string> } = kind === "campaigns" ? campaignsRequest(accountId) : kind === "adSets" ? adSetsRequest(accountId) : kind === "spend" ? accountDailySpendRequest(accountId,range!) : campaignInsightsRequest(accountId,range!);
    const url = new URL(`${this.baseUrl}${request.path}`);
    url.searchParams.set("fields",request.fields.join(",")); url.searchParams.set("limit","100");
    for (const [key,value] of Object.entries(request.params ?? {})) url.searchParams.set(key,value);
    if (options.after) url.searchParams.set("after",options.after);
    if (this.appSecretProof) url.searchParams.set("appsecret_proof",this.appSecretProof);
    const payload = await this.fetchSyncPage<T>(url,options);
    const after = payload.paging?.cursors?.after;
    if (!Array.isArray(payload.data) || payload.data.length > 100 || (after !== undefined && (typeof after !== "string" || after.length > 8192 || after === options.after))) throw new MetaApiError("Halaman Sync Meta tidak valid atau cursor berulang.");
    return { data: payload.data, ...(after ? { after } : {}) };
  }

  private async fetchSyncPage<T>(url: URL, options: MetaSyncReadOptions): Promise<MetaPage<T>> {
    const controller = new AbortController();
    const check = () => {
      if (controller.signal.aborted) throw controller.signal.reason;
      if (Date.now() >= options.deadline) throw new MetaSyncPauseError("DEADLINE");
    };
    const abort = () => controller.abort(new MetaSyncPauseError("ABORTED"));
    options.signal?.addEventListener("abort",abort,{ once: true });
    if (options.signal?.aborted) abort();
    const deadlineTimer = setTimeout(() => controller.abort(new MetaSyncPauseError("DEADLINE")),Math.max(0,options.deadline-Date.now()));
    try {
      for (let attempt=0; attempt<=MAX_RETRIES; attempt++) {
        check();
        const request = new AbortController();
        const requestTimer = setTimeout(() => request.abort(new MetaSyncPauseError("REQUEST_TIMEOUT")),Math.min(10_000, Math.max(0, options.deadline-Date.now())));
        const signal = AbortSignal.any([controller.signal,request.signal]);
        let response: Response, payload: MetaPage<T>;
        try {
          response = await fetch(url,{ headers: { Authorization: `Bearer ${this.config.accessToken}` }, cache: "no-store", signal });
          this.readUsageHeaders(response.headers);
          payload = await response.json() as MetaPage<T>;
          signal.throwIfAborted(); check();
        } catch (error) {
          if (signal.aborted) throw signal.reason;
          if (error instanceof SyntaxError) throw new MetaApiError("Meta Graph API mengembalikan respons tidak valid.");
          throw error;
        } finally { clearTimeout(requestTimer); }
        if (response.ok && !payload.error) return payload;
        const errorCode = Number(payload.error?.code);
        if (attempt < MAX_RETRIES && TEMPORARY_ERROR_CODES.has(errorCode)) {
          const retryAfter = Number(response.headers.get("retry-after"))*1000;
          const wait = Math.max(BASE_RETRY_DELAY_MS*2**attempt, Number.isFinite(retryAfter) ? retryAfter : 0);
          if (wait >= options.deadline-Date.now()) throw new MetaSyncPauseError("RETRY_AFTER",[17,32,613].includes(errorCode));
          await new Promise<void>((resolve,reject) => {
            const onAbort = () => { clearTimeout(timer); controller.signal.removeEventListener("abort",onAbort); reject(controller.signal.reason); };
            const timer = setTimeout(() => { controller.signal.removeEventListener("abort",onAbort); resolve(); },wait);
            controller.signal.addEventListener("abort",onAbort,{ once: true });
            if (controller.signal.aborted) onAbort();
          });
          continue;
        }
        throw new MetaApiError(`${this.redactSecrets(payload.error?.message ?? `Request Meta gagal dengan HTTP ${response.status}`)}${Number.isFinite(errorCode) ? ` (kode ${errorCode})` : ""}`,Number.isFinite(errorCode) ? errorCode : undefined);
      }
      throw new MetaApiError("Meta Graph API gagal setelah batas retry tercapai.");
    } finally {
      clearTimeout(deadlineTimer); options.signal?.removeEventListener("abort",abort);
      controller.abort(new MetaSyncPauseError("ABORTED"));
    }
  }

  async waitBetweenBusinesses() {
    await this.waitBetweenAccounts();
  }

  async waitBetweenAccounts() {
    const usageDelay = this.usagePercent >= 90 ? 3_000 : this.usagePercent >= 75 ? 1_500 : this.usagePercent >= 50 ? 750 : 0;
    await sleep(Math.max(BUSINESS_DELAY_MS, usageDelay));
  }

  private async getAllPages<T>(path: string, fields: string[], params?: Record<string, string>): Promise<T[]> {
    const records: T[] = [];
    let after: string | undefined;
    do {
      const url = new URL(`${this.baseUrl}${path}`);
      url.searchParams.set("fields", fields.join(","));
      url.searchParams.set("limit", "100");
      for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
      if (after) url.searchParams.set("after", after);
      if (this.appSecretProof) url.searchParams.set("appsecret_proof", this.appSecretProof);

      const payload = await this.fetchPage<T>(url);
      records.push(...(payload.data ?? []));
      after = payload.paging?.cursors?.after;
    } while (after);
    return records;
  }

  private async fetchPage<T>(url: URL): Promise<MetaPage<T>> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${this.config.accessToken}` },
        cache: "no-store",
      });
      this.readUsageHeaders(response.headers);

      let payload: MetaPage<T>;
      try {
        payload = (await response.json()) as MetaPage<T>;
      } catch {
        throw new MetaApiError(`Meta Graph API mengembalikan respons tidak valid (HTTP ${response.status}).`);
      }

      if (response.ok && !payload.error) return payload;

      const errorCode = Number(payload.error?.code);
      const canRetry = attempt < MAX_RETRIES && TEMPORARY_ERROR_CODES.has(errorCode);
      if (canRetry) {
        const retryAfter = Number(response.headers.get("retry-after")) * 1_000;
        const backoff = BASE_RETRY_DELAY_MS * 2 ** attempt;
        await sleep(Math.max(backoff, Number.isFinite(retryAfter) ? retryAfter : 0));
        continue;
      }

      if (errorCode === 4) {
        throw new MetaApiError("Meta API sedang mencapai batas request. Coba sinkronisasi kembali setelah beberapa saat.", 4);
      }
      const codeSuffix = Number.isFinite(errorCode) ? ` (kode ${errorCode})` : "";
      const apiMessage = payload.error?.message ?? `Request Meta gagal dengan HTTP ${response.status}`;
      throw new MetaApiError(`${this.redactSecrets(apiMessage)}${codeSuffix}`, Number.isFinite(errorCode) ? errorCode : undefined);
    }
    throw new MetaApiError("Meta Graph API gagal setelah batas retry tercapai.");
  }

  private readUsageHeaders(headers: Headers) {
    const usageValues = [headers.get("x-app-usage"), headers.get("x-business-use-case-usage")];
    let responseUsagePercent = 0;
    for (const value of usageValues) {
      if (!value) continue;
      try {
        responseUsagePercent = Math.max(responseUsagePercent, this.findHighestUsage(JSON.parse(value)));
      } catch {
        // Header usage bersifat opsional; respons Meta tetap dapat diproses jika formatnya tidak dikenal.
      }
    }
    if (usageValues.some(Boolean)) this.usagePercent = responseUsagePercent;
  }

  private findHighestUsage(value: unknown): number {
    if (!value || typeof value !== "object") return 0;
    let highest = 0;
    for (const [key, nestedValue] of Object.entries(value)) {
      if (["call_count", "total_cputime", "total_time"].includes(key) && typeof nestedValue === "number") {
        highest = Math.max(highest, nestedValue);
      } else {
        highest = Math.max(highest, this.findHighestUsage(nestedValue));
      }
    }
    return highest;
  }

  private redactSecrets(message: string) {
    return [this.config.accessToken, this.config.appSecret, this.appSecretProof]
      .filter((secret): secret is string => Boolean(secret))
      .reduce((safeMessage, secret) => safeMessage.replaceAll(secret, "[REDACTED]"), message);
  }
}
