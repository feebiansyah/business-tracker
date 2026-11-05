import "server-only";

import { createHmac } from "node:crypto";
import { getMetaConfig, type MetaConfig } from "@/lib/meta/config";
import { MetaReadError, record } from "./parse";

const BASIC_FIELDS = ["id", "name", "account_id", "configured_status", "effective_status"];
const TRANSIENT_CODES = new Set([1, 2, 4, 17, 32, 613]);
const MAX_REQUESTS = 100;
const MAX_OBJECTS = 5_000;
export type MetaReadPage = { rows: unknown[]; after: string | null };

/** GET-only client, deliberately separate from the unbounded/persisting Sync workflow. */
export class MetaCampaignReadClient {
  readonly startedAt: string;
  private readonly deadline: number;
  private readonly proof?: string;
  private objectCount = 0;
  private readonly pageDepths = new Map<string, number>();
  private readonly membershipCosts = new Map<string, number>();
  requests = 0;

  constructor(private readonly config: MetaConfig = getMetaConfig(), private readonly fetchImpl: typeof fetch = fetch, private readonly now = Date.now, startedAt = now()) {
    if (!/^v\d+\.\d+$/.test(config.apiVersion) || !config.accessToken.trim()) throw new MetaReadError("AUTH", "Konfigurasi akses Meta belum tersedia.");
    this.startedAt = new Date(startedAt).toISOString();
    this.deadline = startedAt + 60_000;
    this.proof = config.appSecret ? createHmac("sha256", config.appSecret).update(config.accessToken).digest("hex") : undefined;
  }

  safeText = (text: string) => [this.config.accessToken, this.config.appSecret, this.proof].filter((value): value is string => !!value)
    .reduce((safe, secret) => safe.replaceAll(secret, "[REDACTED]"), text)
    .replace(/https?:\/\/\S+/gi, "[tautan Meta disembunyikan]").slice(0, 1_000);

  claimObject() {
    if (this.objectCount >= MAX_OBJECTS) throw new MetaReadError("LIMIT", "Batas 5.000 objek turunan tercapai; hierarchy belum lengkap.");
    this.objectCount++;
  }

  private remaining() {
    const remaining = this.deadline - this.now();
    if (remaining <= 0) throw new MetaReadError("LIMIT", "Budget pembacaan 60 detik habis; hierarchy belum lengkap.");
    return remaining;
  }

  private async get(path: string, fields: string[], after?: string) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = this.remaining();
      if (this.requests >= MAX_REQUESTS) throw new MetaReadError("LIMIT", "Batas 100 request/halaman tercapai; hierarchy belum lengkap.");
      this.requests++;
      const url = new URL(`https://graph.facebook.com/${this.config.apiVersion}/${path}`);
      url.searchParams.set("fields", fields.join(","));
      url.searchParams.set("limit", "100");
      if (after) url.searchParams.set("after", after);
      if (this.proof) url.searchParams.set("appsecret_proof", this.proof);
      let response: Response;
      let payload: Record<string, unknown>;
      try {
        response = await this.fetchImpl(url, { method: "GET", cache: "no-store", redirect: "error", headers: { Authorization: `Bearer ${this.config.accessToken}` }, signal: AbortSignal.timeout(Math.min(10_000, remaining)) });
        try { payload = record(await response.json()); }
        catch (error) {
          if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) throw error;
          if (!response.ok) payload = { error: {} };
          else throw new MetaReadError("INVALID_RESPONSE", "Meta mengembalikan JSON/struktur yang tidak valid, bukan daftar kosong.");
        }
      } catch (error) {
        if (error instanceof MetaReadError) throw error;
        const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
        if (attempt === 0 && this.remaining() > 1_000) { await new Promise((resolve) => setTimeout(resolve, 250)); continue; }
        throw new MetaReadError(timeout ? "TIMEOUT" : "PROVIDER", timeout ? "Request Meta melewati batas waktu. Pembacaan belum lengkap." : "Respons Meta gagal dibaca. Coba Refresh manual.");
      }
      if (response.ok && !payload.error) {
        this.observeMembership(path, after, payload);
        return payload;
      }
      const error = payload.error && typeof payload.error === "object" ? payload.error as Record<string, unknown> : {};
      const code = typeof error.code === "number" ? error.code : null;
      // Optional diagnostic fallback is not a retry of the same request.
      if (code === 100 && typeof error.message === "string" && /issues_info/.test(error.message) && /nonexisting|unknown|does not exist|not valid/i.test(error.message)) {
        throw new MetaReadError("INVALID_RESPONSE", "Field diagnostik tidak didukung oleh versi/objek Meta ini.", true);
      }
      const rateLimited = response.status === 429 || (code !== null && [4, 17, 32, 613].includes(code));
      const temporary = response.status >= 500 || rateLimited || error.is_transient === true || (code !== null && TRANSIENT_CODES.has(code));
      if (attempt === 0 && temporary) {
        const retry = response.headers.get("retry-after");
        const seconds = retry === null ? NaN : Number(retry);
        const retryMs = retry === null ? 1_000 : Number.isFinite(seconds) ? seconds * 1_000 : Date.parse(retry) - this.now();
        const delay = Math.max(1_000, Number.isFinite(retryMs) ? retryMs : 1_000);
        if (delay + 500 < this.remaining()) { await new Promise((resolve) => setTimeout(resolve, delay)); continue; }
      }
      if (code === 190 || response.status === 401) throw new MetaReadError("AUTH", "Akses Meta tidak valid atau token kedaluwarsa. Tidak ada status yang diubah.");
      if (code === 10 || code === 200 || response.status === 403) throw new MetaReadError("PERMISSION", "Meta menolak izin pembacaan target ini. Error bukan berarti objek OFF.");
      if (rateLimited) throw new MetaReadError("RATE_LIMIT", "Batas request Meta tercapai; pembacaan belum lengkap. Coba kembali setelah beberapa saat.");
      throw new MetaReadError("PROVIDER", "Meta tidak dapat membaca target ini. Tidak ada perubahan iklan yang dijalankan.");
    }
    throw new MetaReadError("PROVIDER", "Pembacaan Meta gagal.");
  }

  async read(campaignId: string, edge?: "adsets" | "ads", after?: string, diagnostics = true): Promise<{ payload: Record<string, unknown>; diagnostics: boolean }> {
    if (!/^[0-9]{1,100}$/.test(campaignId) || (after !== undefined && !/^[\x21-\x7E]{1,4096}$/.test(after))) throw new MetaReadError("INVALID_RESPONSE", "ID/cursor pembacaan Meta tidak valid.");
    const fields = [...BASIC_FIELDS, ...(edge ? ["campaign_id"] : []), ...(edge === "ads" ? ["adset_id"] : [])];
    const path = `${campaignId}${edge ? `/${edge}` : ""}`;
    try { return { payload: await this.get(path, diagnostics ? [...fields, "issues_info"] : fields, after), diagnostics }; }
    catch (error) {
      if (!(error instanceof MetaReadError) || !error.optionalFieldUnsupported || !diagnostics) throw error;
      return { payload: await this.get(path, fields, after), diagnostics: false };
    }
  }

  /** Typed SDK edges prove object kind; a GET of an arbitrary node alone cannot do that. */
  async readTypedPage(parentId: string, edge: "campaigns" | "adsets" | "ads", after?: string) {
    if (!/^[0-9]{1,100}$/.test(parentId) || (after !== undefined && !/^[\x21-\x7E]{1,4096}$/.test(after))) throw new MetaReadError("INTEGRITY", "ID/cursor pembuktian jenis Meta tidak valid.");
    const path = `${edge === "campaigns" ? "act_" : ""}${parentId}/${edge}`;
    return this.get(path, [...BASIC_FIELDS, ...(edge !== "campaigns" ? ["campaign_id"] : []), ...(edge === "ads" ? ["adset_id"] : [])], after);
  }

  private observeMembership(path: string, after: string | undefined, payload: Record<string, unknown>) {
    if (!/^(act_)?[0-9]+\/(campaigns|adsets|ads)$/.test(path) || !Array.isArray(payload.data)) return;
    const depth = after ? (this.pageDepths.get(path) ?? 0) + 1 : 1;
    this.pageDepths.set(path, depth);
    // Cost metadata only, never object-kind/scope evidence. The target is validated separately.
    for (const row of payload.data.slice(0, 5_000)) if (row && typeof row === "object" && !Array.isArray(row)) {
      const id = (row as Record<string, unknown>).id;
      if (typeof id === "string" && /^[0-9]{1,100}$/.test(id)) this.membershipCosts.set(`${path}/${id}`, depth);
    }
  }

  membershipPageCost(parentId: string, edge: "campaigns" | "adsets" | "ads", id: string) {
    return this.membershipCosts.get(`${edge === "campaigns" ? "act_" : ""}${parentId}/${edge}/${id}`) ?? 1;
  }

  page(payload: Record<string, unknown>): MetaReadPage {
    if (!Array.isArray(payload.data)) throw new MetaReadError("INVALID_RESPONSE", "Daftar objek Meta tidak valid; respons bukan daftar kosong yang terverifikasi.");
    if (payload.paging === undefined) return { rows: payload.data, after: null };
    const paging = record(payload.paging);
    if (paging.next === undefined || paging.next === null) return { rows: payload.data, after: null };
    if (typeof paging.next !== "string" || !paging.next) throw new MetaReadError("INVALID_RESPONSE", "Metadata pagination Meta tidak valid.");
    const after = record(paging.cursors).after;
    if (typeof after !== "string" || !/^[\x21-\x7E]{1,4096}$/.test(after)) throw new MetaReadError("INVALID_RESPONSE", "Halaman berikutnya tidak memiliki cursor Meta yang valid.");
    // paging.next is NEVER fetched. Only the opaque, encoded cursor enters the fixed endpoint.
    return { rows: payload.data, after };
  }
}
