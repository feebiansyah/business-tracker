"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { getNavigationTitle } from "./navigation";
import { mobileDrawerShouldClose } from "./mobile-navigation-state";
import { SidebarNavigationPanel, type SidebarShopeeAccount } from "./sidebar";

export function Topbar({ shopeeAccounts }: { shopeeAccounts: SidebarShopeeAccount[] }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function keydown(event: KeyboardEvent) {
      if (mobileDrawerShouldClose("keydown", event.key)) setDrawerOpen(false);
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keydown);
    };
  }, [drawerOpen]);

  const closeDrawer = () => setDrawerOpen(false);

  return <>
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-md lg:px-8">
      <button type="button" aria-label="Buka navigasi" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)} className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"><Menu className="size-5"/></button>
      <h1 className="min-w-0 truncate text-sm font-semibold tracking-tight text-slate-900 sm:text-base">{getNavigationTitle(pathname)}</h1>
    </header>
    {drawerOpen && <div className="fixed inset-0 z-50 bg-slate-950/55 lg:hidden" onClick={() => { if (mobileDrawerShouldClose("overlay")) closeDrawer(); }}>
      <aside className="flex h-dvh w-72 max-w-[calc(100vw-2.5rem)] flex-col bg-slate-950 text-slate-200 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <SidebarNavigationPanel key={pathname} pathname={pathname} shopeeAccounts={shopeeAccounts} onNavigate={() => { if (mobileDrawerShouldClose("navigation")) closeDrawer(); }} onClose={() => { if (mobileDrawerShouldClose("close-button")) closeDrawer(); }}/>
      </aside>
    </div>}
  </>;
}
