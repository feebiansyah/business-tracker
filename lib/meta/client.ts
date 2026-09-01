import "server-only";

import { createHmac } from "node:crypto";
import { getMetaConfig, type MetaConfig } from "@/lib/meta/config";
import { normalizeMetaAccountPath } from "@/lib/meta/account-id";
import type { MetaAdAccount, MetaBusiness } from "@/lib/meta/types";
import type { MetaCampaign, MetaCampaignInsight } from "@/lib/prafilter/types";

type MetaPage<T> = {
  data?: T[];
  paging?: { cursors?: { after?: string } };
  error?: { message?: string; code?: number };
};

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
    return this.getAllPages<MetaCampaign>(`/${normalizeMetaAccountPath(accountId)}/campaigns`, [
      "id",
      "name",
      "status",
      "effective_status",
      "start_time",
    ]);
  }

  getCampaignInsights(accountId: string, date: string) {
    return this.getAllPages<MetaCampaignInsight>(`/${normalizeMetaAccountPath(accountId)}/insights`, [
      "campaign_id",
      "campaign_name",
      "account_name",
      "clicks",
      "cpc",
      "spend",
      "date_start",
      "date_stop",
    ], {
      level: "campaign",
      time_range: JSON.stringify({ since: date, until: date }),
    });
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
