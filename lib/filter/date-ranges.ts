import type { DateChunk } from "./types";

function parseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

export function buildMonthlyChunks(start: string, end: string): DateChunk[] {
  const chunks: DateChunk[] = [];
  let cursor = parseDate(start);
  const finalDate = parseDate(end);
  while (cursor <= finalDate) {
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const until = monthEnd < finalDate ? monthEnd : finalDate;
    chunks.push({ since: formatDate(cursor), until: formatDate(until) });
    cursor = new Date(until);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return chunks;
}

export function getRequiredHistoryStart({ startDate, historySyncedThrough, today }: { startDate: string | null; historySyncedThrough: string | null; today: string }) {
  if (!historySyncedThrough) return startDate;
  const yesterday = addDays(today, -1);
  return historySyncedThrough < yesterday ? addDays(historySyncedThrough, 1) : yesterday;
}
