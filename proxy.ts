import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-core";
import { isPublicPath } from "@/lib/auth/route-policy";

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-bt-pathname", request.nextUrl.pathname);
  if (!isPublicPath(request.nextUrl.pathname) && !request.cookies.get(SESSION_COOKIE_NAME)?.value) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
