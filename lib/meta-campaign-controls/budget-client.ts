import "server-only";

import { createHmac } from "node:crypto";
import { getMetaConfig, type MetaConfig } from "@/lib/meta/config";
import { MetaActionBudget } from "./action-budget";
import { MetaPausedClient } from "./off-client";
import { metaId, parseMetaObject, record, MetaReadError } from "./parse";
import { budgetFlag } from "./budget-state";
import { parseBudgetValue } from "./budget-money";
import type { BudgetKind, BudgetObject, BudgetSnapshot } from "./budget-types";
import type { PreviewTarget } from "./types";

const identityFields = ["id", "name", "account_id"];
const moneyFields = ["daily_budget", "lifetime_budget"];
const scheduleField = "is_budget_schedule_enabled";
const sharingField = "is_adset_budget_sharing_enabled";
export type BudgetPostResult = "ACKNOWLEDGED" | "REJECTED" | "AMBIGUOUS";

/** Budget-only fields NEVER enter the hierarchy client's common Ad fields. */
export class MetaBudgetClient {
  private readonly transport: typeof fetch;
  private readonly typed: MetaPausedClient;
  private readonly proof?: string;
  lastReadCost = 0;

  constructor(readonly budget: MetaActionBudget, private readonly config: MetaConfig = getMetaConfig(), fetchImpl: typeof fetch = fetch) {
    this.typed = new MetaPausedClient(budget, config, fetchImpl);
    this.transport = budget.wrap(fetchImpl);
    this.proof = config.appSecret ? createHmac("sha256", config.appSecret).update(config.accessToken).digest("hex") : undefined;
  }

  private url(path: string) {
    const url = new URL(`https://graph.facebook.com/${this.config.apiVersion}/${path}`);
    if (this.proof) url.searchParams.set("appsecret_proof", this.proof);
    return url;
  }

  private async get(path: string, fields: string[], after?: string): Promise<Record<string, unknown>> {
    if (after !== undefined && !/^[\x21-\x7E]{1,4096}$/.test(after)) throw new MetaReadError("INTEGRITY", "Cursor anggaran Meta tidak valid.");
    for (let attempt = 0; attempt < 2; attempt++) {
      this.budget.remaining();
      const url = this.url(path);
      url.searchParams.set("fields", fields.join(","));
      url.searchParams.set("limit", "100");
      if (after) url.searchParams.set("after", after);
      let response: Response, payload: Record<string, unknown>;
      try {
        response = await this.transport(url, { method: "GET", cache: "no-store", redirect: "error", headers: { Authorization: `Bearer ${this.config.accessToken}` } });
        payload = record(await response.json());
        this.budget.remaining();
      } catch (error) {
        if (error instanceof MetaReadError) throw error;
        if (attempt === 0 && this.budget.remaining() > 1_000) continue;
        throw new MetaReadError("TIMEOUT", "GET anggaran Meta gagal atau timeout; bukan bukti anggaran kosong.");
      }
      if (response.ok && !payload.error) return payload;
      const error = payload.error && typeof payload.error === "object" ? payload.error as Record<string, unknown> : {};
      const temporary = response.status >= 500 || response.status === 429 || error.is_transient === true || [1, 2, 4, 17, 32, 613].includes(Number(error.code));
      if (attempt === 0 && temporary) {
        const retry = response.headers.get("retry-after");
        const seconds = retry === null ? NaN : Number(retry);
        const delay = Math.max(1_000, retry === null ? 1_000 : Number.isFinite(seconds) ? seconds * 1_000 : Date.parse(retry) - Date.now());
        if (Number.isFinite(delay) && delay + 500 < this.budget.remaining()) { await new Promise((resolve) => setTimeout(resolve, delay)); continue; }
      }
      const optionalUnsupported = error.code === 100 && typeof error.message === "string" && /is_budget_schedule_enabled|is_adset_budget_sharing_enabled/.test(error.message) && /nonexisting|unknown|does not exist|not valid/i.test(error.message);
      throw new MetaReadError("PROVIDER", "Meta menolak pembacaan anggaran/izin/field. Tidak dianggap nilai nol atau schedule nonaktif.", optionalUnsupported);
    }
    throw new MetaReadError("PROVIDER", "Pembacaan anggaran tidak selesai.");
  }

  private async budgetFields(path: string, kind: BudgetKind, after?: string) {
    const core = [...identityFields, ...(kind === "adset" ? ["campaign_id"] : []), ...moneyFields];
    try { return await this.get(path, [...core, scheduleField, ...(kind === "campaign" ? [sharingField] : [])], after); }
    catch (error) {
      if (!(error instanceof MetaReadError) || !error.optionalFieldUnsupported) throw error;
      // Unsupported optional flags remain MISSING, never false. Basic values stay readable.
      return this.get(path, core, after);
    }
  }

  private object(value: unknown, kind: BudgetKind, target: PreviewTarget, expectedId?: string): BudgetObject {
    const row = record(value);
    const parsed = parseMetaObject(row, { accountId: target.wl.id, ...(expectedId ? { objectId: expectedId } : {}), ...(kind === "adset" ? { campaignId: target.campaign.id } : {}) }, this.typed.reader.safeText);
    return { id: parsed.view.id, name: parsed.view.name, kind, parentId: kind === "adset" ? target.campaign.id : null, daily: parseBudgetValue(row.daily_budget), lifetime: parseBudgetValue(row.lifetime_budget), schedule: budgetFlag(row[scheduleField]) };
  }

  async snapshot(target: PreviewTarget): Promise<BudgetSnapshot> {
    const started = this.budget.requests;
    // Official typed edge membership proves campaign kind; the adsets budget edge
    // below proves each set's kind AND scope. Arbitrary node IDs cannot choose kind.
    await this.typed.object(target, target.campaign.id, "campaign");
    const account = await this.get(`act_${metaId(target.wl.id)}`, ["id", "account_id", "currency"]);
    if (account.id !== `act_${target.wl.id}` || metaId(account.account_id) !== target.wl.id) throw new MetaReadError("INTEGRITY", "Identitas WL anggaran tidak sesuai target.");
    const currency = typeof account.currency === "string" && /^[A-Z]{3}$/.test(account.currency) ? account.currency : null;
    const campaignRow = await this.budgetFields(metaId(target.campaign.id), "campaign");
    const campaign = this.object(campaignRow, "campaign", target, target.campaign.id);
    const adSets: BudgetObject[] = [], cursors = new Set<string>(), ids = new Set<string>();
    const warnings: string[] = [];
    let complete = false, after: string | undefined;
    try {
      do {
        const page = this.typed.reader.page(await this.budgetFields(`${target.campaign.id}/adsets`, "adset", after));
        for (const row of page.rows) {
          const object = this.object(row, "adset", target);
          if (ids.has(object.id)) throw new MetaReadError("INTEGRITY", "Set iklan anggaran berulang; data tidak lengkap.");
          if (adSets.length >= 5_000) throw new MetaReadError("LIMIT", "Batas 5.000 set iklan tercapai.");
          ids.add(object.id); adSets.push(object);
        }
        if (page.after && cursors.has(page.after)) throw new MetaReadError("INTEGRITY", "Cursor anggaran berulang.");
        after = page.after ?? undefined;
        if (after) cursors.add(after);
      } while (after);
      complete = true;
    } catch (error) {
      if (error instanceof MetaReadError && error.kind === "INTEGRITY") throw error;
      warnings.push(error instanceof MetaReadError ? error.message : "Pembacaan set iklan belum lengkap.");
    }
    this.lastReadCost = this.budget.requests - started;
    return { target, currency, campaign, adSets, sharing: budgetFlag(campaignRow[sharingField]), complete, warnings, readAt: new Date().toISOString() };
  }

  /** No free fields/status/URL/method, no retry, no full-object update. */
  async writeDailyBudget(id: string, amount: string): Promise<BudgetPostResult> {
    if (parseBudgetValue(amount).state !== "VALUE" || BigInt(amount) <= BigInt(0)) throw new MetaReadError("INVALID_RESPONSE", "Nominal daily_budget tidak valid.");
    this.budget.remaining();
    const url = this.url(metaId(id));
    try {
      const response = await this.transport(url, { method: "POST", cache: "no-store", redirect: "error", headers: { Authorization: `Bearer ${this.config.accessToken}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ daily_budget: amount }) });
      const payload = record(await response.json());
      if (response.ok && payload.success === true) return "ACKNOWLEDGED";
      return response.status >= 400 && response.status < 500 && payload.error ? "REJECTED" : "AMBIGUOUS";
    } catch { return "AMBIGUOUS"; }
  }
}
