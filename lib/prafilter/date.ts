const OPERATIONAL_TIME_ZONE = "Asia/Jakarta";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateInput(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function getOperationalDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OPERATIONAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getTodayOperationalDate() {
  return getOperationalDate(new Date()) ?? "";
}

export function isCampaignStartOnDate(startTime: string | Date | null | undefined, selectedDate: string) {
  if (!startTime || !isValidDateInput(selectedDate)) return false;
  return getOperationalDate(startTime) === selectedDate;
}

export function getOperationalDateRange(selectedDate: string) {
  if (!isValidDateInput(selectedDate)) throw new Error("Tanggal Prafilter tidak valid.");
  const start = new Date(`${selectedDate}T00:00:00+07:00`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1_000) };
}
