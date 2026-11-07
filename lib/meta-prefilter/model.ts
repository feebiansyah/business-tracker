import { Prisma } from "@/lib/generated/prisma/client";
import type { MetaCampaignInsight } from "@/lib/meta/types";
import type { PrefilterSlot } from "./types";

export const businessDate = (now: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
export const dateValue = (date: string) => new Date(date + "T00:00:00Z");
export function slotValue(value: unknown): PrefilterSlot {
  if (value !== "AWAL" && value !== "AKHIR") throw new Error("Slot snapshot tidak valid.");
  return value;
}
export function metaId(value: unknown) {
  if (typeof value !== "string" || !/^[1-9]\d{0,63}$/.test(value)) throw new Error("Identitas Meta tidak valid.");
  return value;
}
export const accountId = (value: string) => metaId(value.replace(/^act_/, "").replace(/^0+(?=\d)/, ""));
export function statusValue(value: unknown) { return typeof value === "string" && /^[A-Z_]{1,50}$/.test(value) ? value : null; }
export function nameValue(value: unknown, fallback: string) { return typeof value === "string" && value.trim() ? value.slice(0,1024) : fallback; }
export function readInsight(row: MetaCampaignInsight, date: string) {
  metaId(row.campaign_id);
  if (row.date_start !== date || row.date_stop !== date || typeof row.spend !== "string" || !/^\d+(\.\d+)?$/.test(row.spend) || row.spend.length > 32) throw new Error("Insight hari berjalan tidak valid.");
  const spend = new Prisma.Decimal(row.spend);
  if (spend.decimalPlaces() > 6 || spend.gte("1000000000000000000")) throw new Error("Nilai spend tidak dapat disimpan dengan aman.");
  if (!spend.gt(0)) return null;
  const raw = row.inline_link_clicks;
  const clicks = typeof raw === "string" && /^\d{1,19}$/.test(raw) && BigInt(raw) <= BigInt("9223372036854775807") ? BigInt(raw) : null;
  return { metaCampaignId: row.campaign_id, campaignName: nameValue(row.campaign_name,row.campaign_id), spend: spend.toString(), clicks };
}
export function cpc(spend: string, clicks: bigint | string | null) { return clicks === null || BigInt(clicks) === BigInt(0) ? null : new Prisma.Decimal(spend).div(String(clicks)).toString(); }
