import { providerReasons } from "./diagnostics";
import type { WhitelistRejection } from "./types";

/** Documented error records only; landing keys are NOT placement identities. */
export function parseWhitelistRejection(body: unknown, target: readonly string[]): WhitelistRejection {
  const allowed = new Set(target), ids = new Set<string>();
  const groups = new Map<string, WhitelistRejection["groups"][number]>();
  let complete = true, records = 0;
  const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  function read(value: unknown, field: "ids" | "placement_ids") {
    const row = object(value);
    if (++records > 100 || !row || typeof row.reason !== "string" || !Array.isArray(row[field])) { complete = false; return; }
    const reason = providerReasons({ reason: row.reason })[0];
    if (reason === "Provider reason unavailable") complete = false;
    if (!groups.has(reason)) {
      if (groups.size >= 8) { complete = false; return; }
      groups.set(reason, { reason, ids: [] });
    }
    const group = groups.get(reason)!;
    const values = row[field] as unknown[];
    if (values.length > 500) complete = false;
    for (const raw of values.slice(0, 500)) {
      const id = (typeof raw === "number" || typeof raw === "string") && /^\d+$/.test(String(raw)) && Number.isSafeInteger(Number(raw)) && Number(raw) > 0 ? String(Number(raw)) : "";
      if (!allowed.has(id)) { complete = false; continue; }
      if (!ids.has(id) && ids.size >= 500) { complete = false; continue; }
      ids.add(id);
      if (!group.ids.includes(id)) group.ids.push(id);
    }
  }
  const errors = object(object(body)?.errors);
  if (!errors) return { ids: [], groups: [], complete: false };
  if (Object.keys(errors).some((key) => !["landing_ids", "placement_ids"].includes(key))) complete = false;
  if (errors.placement_ids !== undefined) {
    if (!Array.isArray(errors.placement_ids)) complete = false;
    else { if (errors.placement_ids.length > 100) complete = false; for (const row of errors.placement_ids.slice(0, 100)) read(row, "ids"); }
  }
  if (errors.landing_ids !== undefined) {
    const landings = object(errors.landing_ids);
    if (!landings) complete = false;
    else {
      const entries = Object.entries(landings);
      if (entries.length > 100) complete = false;
      for (const [landing, rows] of entries.slice(0, 100)) {
        if (!/^\d+$/.test(landing) || !Array.isArray(rows)) { complete = false; continue; }
        if (rows.length > 100) complete = false;
        for (const row of rows.slice(0, 100)) { if (records >= 100) { complete = false; break; } read(row, "placement_ids"); }
      }
    }
  }
  return { ids: [...ids], groups: [...groups.values()].filter((g) => g.ids.length), complete: complete && records > 0 };
}
