export type TrafficPlatformCheck = {
  status: "SAFE" | "ATTENTION" | "UNAVAILABLE";
  latestDate: string | null;
  platforms: string[];
  relatedRowCount: number;
  reason: "MISSING_PLATFORM_HEADER" | "NO_RELATED_ROWS" | null;
};

// Dates have already been validated/normalized by the existing Shopee CSV parser.
export function checkTrafficPlatform(rows: readonly { date: string; tagLink1: string; platform?: string }[], sourceTag: string): TrafficPlatformCheck {
  let latestDate: string | null = null;
  for (const row of rows) if (latestDate === null || row.date > latestDate) latestDate = row.date;
  const source = sourceTag.trim().toUpperCase();
  const related = rows.filter(row => row.date === latestDate && row.tagLink1.trim().toUpperCase() === source);
  const base = { latestDate, platforms: [] as string[], relatedRowCount: related.length };
  if (rows.some(row => row.platform === undefined)) return { ...base, status: "UNAVAILABLE", reason: "MISSING_PLATFORM_HEADER" };
  if (!related.length) return { ...base, status: "UNAVAILABLE", reason: "NO_RELATED_ROWS" };
  const unique = new Map<string, string>();
  for (const row of related) {
    const value = row.platform!.trim(), normalized = value.toLowerCase();
    if (!unique.has(normalized)) unique.set(normalized, normalized === "facebook" ? "Facebook" : value);
  }
  return { ...base, platforms: [...unique.values()], status: [...unique.keys()].every(value => value === "facebook") ? "SAFE" : "ATTENTION", reason: null };
}
