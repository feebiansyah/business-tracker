export const ADSTERRA_SCHEDULE_TIME_ZONE = "Asia/Jakarta";
export const ADSTERRA_SCHEDULE = {
  on: { hour: 8, minute: 5 },
  off: { hour: 21, minute: 50 },
} as const;

export type CalendarDate = { year: number; month: number; day: number };

const jakartaDateFormatter = new Intl.DateTimeFormat("en-CA-u-nu-latn", {
  timeZone: ADSTERRA_SCHEDULE_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

export function getJakartaDateParts(date: Date): CalendarDate {
  const parts = Object.fromEntries(
    jakartaDateFormatter.formatToParts(date)
      .filter((part) => part.type === "year" || part.type === "month" || part.type === "day")
      .map((part) => [part.type, Number(part.value)]),
  );
  return { year: parts.year, month: parts.month, day: parts.day };
}

export function getNextJakartaCalendarDate(date: Date): CalendarDate {
  const current = getJakartaDateParts(date);
  const next = new Date(Date.UTC(current.year, current.month - 1, current.day));
  next.setUTCDate(next.getUTCDate() + 1);
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

export function shouldSkipScheduledOff(now: Date): boolean {
  const tomorrow = getNextJakartaCalendarDate(now);
  return tomorrow.day === tomorrow.month || tomorrow.day === 25;
}
