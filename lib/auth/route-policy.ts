export function isPublicPath(pathname: string) { return pathname === "/login" || pathname.startsWith("/_next/") || pathname === "/favicon.ico"; }
