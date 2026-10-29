import { createHash } from "node:crypto";
import { OperationError } from "./types";

export function campaignKey(value: unknown): string {
  if (typeof value !== "string" || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) throw new OperationError("Campaign ID Adsterra tidak valid.");
  return String(Number(value));
}
export function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function exactSet(a: readonly string[], b: readonly string[]) { return a.length === b.length && a.every((id) => b.includes(id)); }
export function sortedIds(ids: readonly string[]) { return [...new Set(ids)].sort((a, b) => a.localeCompare(b, "en", { numeric: true })); }
