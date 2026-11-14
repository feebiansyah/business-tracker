import type { TrafficPlatformCheck } from "@/lib/traffic-roi/platform-check";

const date = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export function TrafficPlatformNotice({ check }: { check?: TrafficPlatformCheck }) {
  if (!check) return null;
  const message = check.status === "SAFE" ? "Platform tanggal terbaru: Facebook — aman."
    : check.status === "ATTENTION" ? "Perhatian: Platform tanggal terbaru bukan Facebook. Ganti link Clickadu/Adsterra secara manual."
      : "Platform tanggal terbaru belum dapat diperiksa.";
  return <div role="status" className={`min-w-0 rounded-lg border p-3 text-sm ${check.status === "SAFE" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
    <p className="break-words">{message}</p>
    <p className="mt-1 break-words text-xs [overflow-wrap:anywhere]">Tanggal terbaru CSV: {check.latestDate ? date.format(new Date(`${check.latestDate}T00:00:00Z`)) : "—"} · Platform: {check.platforms.length ? check.platforms.slice(0, 5).map(value => value || "(kosong)").join(" · ") : "—"}{check.platforms.length > 5 ? ` · +${check.platforms.length - 5} lainnya` : ""} · {check.relatedRowCount} baris terkait.</p>
    {check.reason === "MISSING_PLATFORM_HEADER" && <p className="mt-1 text-xs">Kolom Platform tidak ditemukan. Analisis ROI tetap berjalan.</p>}
    {check.reason === "NO_RELATED_ROWS" && <p className="mt-1 text-xs">Tidak ada baris Tag_link1 campaign ini pada tanggal terbaru CSV.</p>}
  </div>;
}
