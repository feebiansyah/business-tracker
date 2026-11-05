import type { MetaObjectView, ReadErrorKind } from "./types";

export class MetaReadError extends Error {
  constructor(readonly kind: ReadErrorKind, message: string, readonly optionalFieldUnsupported = false) {
    super(message);
    this.name = "MetaReadError";
  }
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MetaReadError("INVALID_RESPONSE", "Struktur respons Meta tidak valid.");
  return value as Record<string, unknown>;
}

export function metaId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value) || value.length > 100) throw new MetaReadError("INTEGRITY", "Identitas objek Meta tidak valid; data tidak digabungkan.");
  return value;
}

export function parseMetaObject(value: unknown, expected: { accountId: string; campaignId?: string; objectId?: string }, safeText: (text: string) => string) {
  const row = record(value);
  const id = metaId(row.id);
  if (metaId(row.account_id) !== expected.accountId || (expected.objectId && id !== expected.objectId)
    || (expected.campaignId && metaId(row.campaign_id) !== expected.campaignId)) {
    throw new MetaReadError("INTEGRITY", "Relasi campaign/WL dari Meta tidak sesuai target. Objek tidak dimasukkan ke hierarchy.");
  }
  const text = (value: unknown) => typeof value === "string" && value.trim() ? safeText(value) : null;
  let available = Array.isArray(row.issues_info);
  const messages: string[] = [];
  if (available) for (const issue of row.issues_info as unknown[]) {
    if (!issue || typeof issue !== "object" || Array.isArray(issue)) { available = false; break; }
    const fields = issue as Record<string, unknown>;
    const detail = [text(fields.error_summary), text(fields.error_message)].filter(Boolean).join(" — ");
    if (!detail) { available = false; break; }
    messages.push(detail);
  }
  const view: MetaObjectView = {
    id, name: text(row.name), configuredStatus: text(row.configured_status), effectiveStatus: text(row.effective_status),
    diagnostics: { available, messages: available ? messages : [] },
  };
  return { view, adSetId: expected.campaignId && row.adset_id !== undefined ? metaId(row.adset_id) : undefined };
}
