"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getNavigationTitle, isNavigationItemActive, mobileNavigationItems } from "./navigation";

export function Topbar() {
  const pathname = usePathname();
  return <header className="sticky top-0 z-10 flex h-14 items-center border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-md lg:px-8">
    <h1 className="text-sm font-semibold tracking-tight text-slate-900 sm:text-base">{getNavigationTitle(pathname)}</h1>
    <nav className="fixed inset-x-0 bottom-0 flex justify-around gap-1 overflow-x-auto border-t border-slate-200 bg-white/95 p-2 shadow-[0_-8px_24px_rgba(15,23,42,0.05)] backdrop-blur lg:hidden" aria-label="Navigasi mobile">
      {mobileNavigationItems.map((item) => {
        const Icon = item.icon;
        const isActive = isNavigationItemActive(pathname, item.href);
        return <Link key={item.href} href={item.href} className={`flex min-w-18 flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-medium transition-colors ${isActive ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}><Icon className="size-4" aria-hidden="true"/>{item.label}</Link>;
      })}
    </nav>
  </header>;
}
