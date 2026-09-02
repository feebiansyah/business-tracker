import type { ClickAggregation, ParsedClickCsv } from "./types.ts";

export function aggregateShopeeClicks(parsed: ParsedClickCsv): ClickAggregation {
  const grouped = new Map<string, ClickAggregation["aggregates"][number]>();
  for (const row of parsed.rows) {
    const key = `${row.date}\u0000${row.normalizedTagLink2}`;
    const current = grouped.get(key);
    if (current) current.clickCount += 1;
    else grouped.set(key, { date: row.date, tagLink2: row.tagLink2, normalizedTagLink2: row.normalizedTagLink2, clickCount: 1 });
  }
  const aggregates = [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date) || a.normalizedTagLink2.localeCompare(b.normalizedTagLink2));
  const dates = aggregates.map((row) => row.date);
  return { ...parsed, aggregates, groupCount: aggregates.length, dateFrom: dates[0], dateTo: dates.at(-1)! };
}
