const ADSTERRA_SCHEDULER_PATH = "/api/internal/adsterra-scheduler";

export function isPublicPath(pathname: string) {
  return pathname === "/login"
    || pathname === ADSTERRA_SCHEDULER_PATH
    || pathname.startsWith("/_next/")
    || pathname === "/favicon.ico";
}
