import { cn } from "@/lib/utils";

export function ConnectionStatusBadge({ connected }: { connected: boolean }) {
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", connected ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-800")}>{connected ? "Terhubung" : "Belum Terhubung"}</span>;
}
