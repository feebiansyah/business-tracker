/** Only fixed stages/reasons are allowed across the provider -> DB -> browser boundary. */
const stages = ["READ_CAMPAIGN", "READ_BLACKLIST", "READ_WHITELIST", "READ_CUSTOM_BIDS", "READ_STATISTICS", "READ_OTHER",
  "PUT_BLACKLIST", "PUT_WHITELIST", "CLEAR_BLACKLIST", "CLEAR_WHITELIST", "CUSTOM_BID_POST", "CUSTOM_BID_PATCH", "CUSTOM_BID_DELETE", "CAMPAIGN_STATUS_WRITE",
  "PREFLIGHT", "PUT_TARGET", "VERIFY_LISTS", "RESET_CUSTOM_BIDS", "FINAL_VERIFICATION", "NOT_DISPATCHED", "METHOD_PREFLIGHT", "METHOD_CLEAR_OPPOSITE", "METHOD_DISABLE_AUTO", "METHOD_OFF", "METHOD_VERIFY", "METHOD_FINALIZE"] as const;
const kinds = ["HTTP_ERROR", "INVALID_RESPONSE", "REQUEST_INCOMPLETE", "BODY_LIMIT", "VERIFICATION_MISMATCH", "OPERATION_INTERRUPTED"] as const;
const reasons = ["Token not found", "Invalid token", "Invalid owner type", "Invalid output format", "Campaign not found", "In use landings not found",
  "Validation failed", "Data validation error", "Unsuccessfully linked", "Not exists", "Not suitable ad unit", "Not suitable category", "Already linked", "Blacklisted",
  "Not suitable tags", "Not active publisher", "Not active placement", "Invalid integer field", "Placement IDs not found", "Campaign landings not found",
  "Blacklist unreadable while campaign has whitelist", "Method not allowed", "Provider reason unavailable", "Invalid API response", "Request did not complete", "Response body limit exceeded", "GET does not match confirmed state", "Operation interrupted"] as const;
export type OperationDiagnostic = {
  stage: (typeof stages)[number]; kind: (typeof kinds)[number]; httpStatus: number | null; reasons: (typeof reasons)[number][];
  rejected?: { reason: (typeof reasons)[number]; placementIds: string[] }[];
};
export type SavedDiagnostics = { phase: string | null; writes: number | null; entries: OperationDiagnostic[]; previous?: Omit<SavedDiagnostics, "previous"> };
export function diagnosticStage(path: string, method: string): OperationDiagnostic["stage"] {
  if (method === "GET") return path.includes("custom_bid") ? "READ_CUSTOM_BIDS" : path.includes("blacklist") ? "READ_BLACKLIST"
    : path.includes("whitelist") ? "READ_WHITELIST" : path.includes("stats") ? "READ_STATISTICS" : /\/campaign\/\d+\.json$/.test(path) ? "READ_CAMPAIGN" : "READ_OTHER";
  return path.includes("custom_bid") ? method === "DELETE" ? "CUSTOM_BID_DELETE" : method === "PATCH" ? "CUSTOM_BID_PATCH" : "CUSTOM_BID_POST"
    : path.includes("linking") ? method === "POST" ? path.includes("blacklist") ? "CLEAR_BLACKLIST" : "CLEAR_WHITELIST"
      : path.includes("blacklist") ? "PUT_BLACKLIST" : "PUT_WHITELIST" : "CAMPAIGN_STATUS_WRITE";
}
function safeReason(value: unknown): OperationDiagnostic["reasons"][number] | null {
  if (typeof value !== "string" || value.length > 500) return null;
  if ((reasons as readonly string[]).includes(value)) return value as OperationDiagnostic["reasons"][number];
  if (/^Placement with ids [\d, ]+ not found$/.test(value)) return "Placement IDs not found";
  if (/^Landings for campaign with id \d+ not found$/.test(value)) return "Campaign landings not found";
  if (/^Campaigns, inoperable due to having a whitelist: \d+(?:, ?\d+)*$/.test(value)) return "Blacklist unreadable while campaign has whitelist";
  if (value === "This value should be of type int.") return "Invalid integer field";
  return null;
}
export function providerReasons(body: unknown): OperationDiagnostic["reasons"] {
  const found: OperationDiagnostic["reasons"] = [];
  let visited = 0;
  function visit(value: unknown, depth: number) {
    if (++visited > 150 || depth > 6 || found.length >= 4) return;
    const reason = safeReason(value);
    if (reason && !found.includes(reason)) found.push(reason);
    if (Array.isArray(value)) { for (const item of value.slice(0, 20)) visit(item, depth + 1); }
    else if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value).slice(0, 30)) {
        if (["message", "reason", "error", "errors", "campaign_id", "campaign_ids", "placement_ids", "landing_ids"].includes(key) || /^\d+$/.test(key)) visit(item, depth + 1);
      }
    }
  }
  visit(body, 0);
  return found.length ? found : ["Provider reason unavailable"];
}
export function diagnosticText(entry: OperationDiagnostic) {
  return `${entry.stage} · ${entry.kind}${entry.httpStatus === null ? "" : ` · HTTP ${entry.httpStatus}`} · ${entry.reasons.join("; ")}${entry.rejected?.length ? ` · ID terkait (cuplikan): ${entry.rejected.map((r) => `${r.reason}: ${r.placementIds.join(", ")}`).join("; ")}` : ""}`;
}
export function rejectedPlacements(body: unknown, confirmedIds: readonly string[]): NonNullable<OperationDiagnostic["rejected"]> {
  const allowed = new Set(confirmedIds), groups = new Map<string, { reason: (typeof reasons)[number]; placementIds: string[] }>();
  let nodes = 0, retained = 0;
  function visit(value: unknown, depth: number) {
    if (!value || typeof value !== "object" || ++nodes > 150 || depth > 6 || retained >= 20) return;
    if (Array.isArray(value)) { value.slice(0, 30).forEach((v) => visit(v, depth + 1)); return; }
    const object = value as Record<string, unknown>;
    if (typeof object.reason === "string" && Array.isArray(object.placement_ids)) {
      const reason = safeReason(object.reason) ?? "Provider reason unavailable";
      if (!groups.has(reason) && groups.size < 4) groups.set(reason, { reason, placementIds: [] });
      const group = groups.get(reason);
      if (group) for (const id of object.placement_ids.slice(0, 100)) {
        const normalized = (typeof id === "number" || typeof id === "string") && /^\d+$/.test(String(id)) && Number.isSafeInteger(Number(id)) ? String(Number(id)) : "";
        if (allowed.has(normalized) && !group.placementIds.includes(normalized) && retained < 20) { group.placementIds.push(normalized); retained++; }
      }
    }
    for (const [key, item] of Object.entries(object).slice(0, 30)) if (["errors", "landing_ids"].includes(key) || /^\d+$/.test(key)) visit(item, depth + 1);
  }
  visit(body, 0);
  return [...groups.values()].filter((g) => g.placementIds.length);
}
function validEntry(value: unknown): value is OperationDiagnostic {
  if (!value || typeof value !== "object") return false;
  const e = value as OperationDiagnostic;
  return (stages as readonly unknown[]).includes(e.stage) && (kinds as readonly unknown[]).includes(e.kind)
    && (e.httpStatus === null || Number.isInteger(e.httpStatus) && e.httpStatus >= 100 && e.httpStatus <= 599)
    && Array.isArray(e.reasons) && e.reasons.length > 0 && e.reasons.length <= 4 && e.reasons.every((r) => (reasons as readonly unknown[]).includes(r));
}
function projectEntry(e: OperationDiagnostic): OperationDiagnostic {
  const rejected = Array.isArray(e.rejected) ? e.rejected.slice(0, 4).filter((g) => g && (reasons as readonly unknown[]).includes(g.reason) && Array.isArray(g.placementIds))
    .map((g) => ({ reason: g.reason, placementIds: g.placementIds.filter((id) => typeof id === "string" && /^[1-9]\d{0,15}$/.test(id)).slice(0, 5) })).filter((g) => g.placementIds.length) : [];
  return { stage: e.stage, kind: e.kind, httpStatus: e.httpStatus, reasons: [...e.reasons], ...(rejected.length ? { rejected } : {}) };
}
export function readDiagnostics(summary: string | null): SavedDiagnostics {
  const empty: SavedDiagnostics = { phase: null, writes: null, entries: [] };
  if (!summary || summary.length > 2000) return empty;
  try {
    const data = JSON.parse(summary);
    if (!data || typeof data !== "object") return empty;
    const previous = data.previousFailure && typeof data.previousFailure === "object" ? data.previousFailure : null;
    return { phase: (stages as readonly unknown[]).includes(data.phase) ? data.phase : null,
      writes: Number.isInteger(data.writes) && data.writes >= 0 && data.writes <= 40 ? data.writes : null,
      entries: data.v === 1 && Array.isArray(data.diagnostics) ? data.diagnostics.filter(validEntry).slice(0, 4).map(projectEntry) : [],
      ...(previous ? { previous: { phase: (stages as readonly unknown[]).includes(previous.phase) ? previous.phase : null,
        writes: Number.isInteger(previous.writes) && previous.writes >= 0 && previous.writes <= 40 ? previous.writes : null,
        entries: Array.isArray(previous.entries) ? previous.entries.filter(validEntry).slice(0, 2).map(projectEntry) : [] } } : {}) };
  } catch { return empty; }
}
/** Keep one bounded last failure, not an unbounded history or arbitrary DB prose. */
export function retainFailureSummary(previous: string | null, next: string) {
  const incoming = readDiagnostics(next), old = readDiagnostics(previous);
  const failures = (saved: SavedDiagnostics, summary: string | null) => {
    let verified = false;
    try { verified = ["VERIFIED", "NO_CHANGE"].includes(JSON.parse(summary ?? "").status); } catch { /* Not a verified completion. */ }
    // Preserve this GET evidence in the current summary, but do not let a
    // successfully paired read-contract refusal erase the last real PUT error.
    return verified ? saved.entries.filter((entry) => !(entry.stage === "READ_BLACKLIST" && entry.httpStatus === 422
      && entry.reasons.includes("Blacklist unreadable while campaign has whitelist"))) : saved.entries;
  };
  if (failures(incoming, next).length) return next.slice(0, 2000);
  const oldFailures = failures(old, previous);
  const failure = old.previous ?? (oldFailures.length || previous?.includes('"status":"PARTIAL"') ? { phase: old.phase, writes: old.writes, entries: oldFailures } : null);
  if (!failure) return next.slice(0, 2000);
  let base: Record<string, unknown>;
  try { base = JSON.parse(next); if (!base || typeof base !== "object") return previous!.slice(0, 2000); }
  catch { return previous!.slice(0, 2000); }
  const prior = { ...failure, entries: failure.entries.slice(0, 2) };
  const encode = () => JSON.stringify({ ...base, previousFailure: prior });
  while (encode().length > 1900 && prior.entries.length) prior.entries.pop();
  return encode().length <= 2000 ? encode() : next.slice(0, 2000);
}
export function diagnosticSummary(result: { status: string; phase: string; metadata: string; diagnostics?: OperationDiagnostic[] }, writes: number) {
  const diagnostics = (result.diagnostics ?? []).filter(validEntry).slice(0, 4).map(projectEntry);
  // Keep the first provider failure if space is tight. Never slice serialized JSON.
  const encode = () => JSON.stringify({ v: 1, status: ["VERIFIED", "NO_CHANGE", "RECONFIRM_REQUIRED", "PARTIAL", "UNVERIFIED"].includes(result.status) ? result.status : "UNVERIFIED",
    phase: (stages as readonly string[]).includes(result.phase) ? result.phase : "PREFLIGHT",
    metadata: ["RECORDED", "FAILED", "NOT_REQUIRED"].includes(result.metadata) ? result.metadata : "FAILED", writes: Number.isInteger(writes) && writes >= 0 && writes <= 40 ? writes : null, diagnostics });
  while (encode().length > 1900 && diagnostics.length) diagnostics.pop();
  return encode();
}
