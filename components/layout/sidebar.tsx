"use client";

import { useReducer } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { createSidebarExpansionState, getShopeeNavigationState, reduceSidebarExpansion } from "./navigation-state";
import {
  dashboardNavigation,
  isNavigationItemActive,
  metaAdsNavigation,
  settingsNavigation,
  shopeeNavigation,
  shopeeWorkflows,
  type NavigationItem,
} from "./navigation";

export type SidebarShopeeAccount = { id: number; name: string };
const rootLinkClass = "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors";
const inactiveRootClass = "text-slate-300 hover:bg-slate-800/70 hover:text-white";
const activeRootClass = "bg-blue-500/15 text-blue-200 ring-1 ring-inset ring-blue-400/20";

export function Sidebar({ shopeeAccounts }: { shopeeAccounts: SidebarShopeeAccount[] }) {
  const pathname = usePathname();
  return <aside className="hidden h-screen w-56 shrink-0 flex-col bg-slate-950 text-slate-200 lg:sticky lg:top-0 lg:flex">
    <SidebarNavigationPanel key={pathname} pathname={pathname} shopeeAccounts={shopeeAccounts}/>
  </aside>;
}

export function SidebarNavigationPanel({ pathname, shopeeAccounts, onNavigate, onClose }: { pathname: string; shopeeAccounts: SidebarShopeeAccount[]; onNavigate?: () => void; onClose?: () => void }) {
  const shopeeActive = pathname === "/shopee" || pathname.startsWith("/shopee/");
  const [expansion, dispatchExpansion] = useReducer(reduceSidebarExpansion, pathname, createSidebarExpansionState);
  const ShopeeIcon = shopeeNavigation.icon;
  const MetaIcon = metaAdsNavigation.icon;
  const showShopeeAccounts = expansion.shopeeExpanded;

  return <>
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-800 px-4">
      <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500 text-[11px] font-bold tracking-wide text-white shadow-sm shadow-blue-950/30">BT</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold tracking-tight text-white">Ads Business Tracker</p>
        <p className="text-[11px] text-slate-400">Operations workspace</p>
      </div>
      {onClose && <button type="button" aria-label="Tutup navigasi" onClick={onClose} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"><X className="size-4"/></button>}
    </div>

    <nav className="sidebar-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-2.5 py-4" aria-label="Navigasi utama">
      <div><StaticNavigationLink item={dashboardNavigation} pathname={pathname} onNavigate={onNavigate}/></div>

      <NavigationGroup label={metaAdsNavigation.label}>
        <div className="mb-1 flex items-center gap-3 px-3 text-slate-500"><MetaIcon className="size-4" aria-hidden="true"/><span className="text-[11px] font-semibold uppercase tracking-[0.16em]">{metaAdsNavigation.label}</span></div>
        {metaAdsNavigation.items.map((item) => <StaticNavigationLink key={item.href} item={item} pathname={pathname} nested onNavigate={onNavigate}/>)}
      </NavigationGroup>

      <NavigationGroup label="Shopee">
        <div className="flex items-center gap-1">
          <Link href={shopeeNavigation.href} onClick={onNavigate} className={cn(rootLinkClass, "min-w-0 flex-1", shopeeActive ? activeRootClass : inactiveRootClass)}>
            <ShopeeIcon className="size-4 shrink-0" aria-hidden="true"/>
            <span className="truncate">{shopeeNavigation.label}</span>
          </Link>
          <button type="button" aria-label={`${showShopeeAccounts ? "Tutup" : "Buka"} daftar Akun Shopee`} aria-expanded={showShopeeAccounts} onClick={() => dispatchExpansion({ type: "TOGGLE_SHOPEE" })} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white">
            {showShopeeAccounts ? <ChevronDown className="size-4"/> : <ChevronRight className="size-4"/>}
          </button>
        </div>

        {showShopeeAccounts && <div className="ml-4 mt-1.5 space-y-1.5 border-l border-slate-700/60 pl-2.5">
          {shopeeAccounts.map((account) => {
            const state = getShopeeNavigationState(pathname, account.id);
            const showWorkflows = expansion.expandedAccountId === account.id;
            return <div key={account.id}>
              <div className="flex items-center gap-1">
                <Link href={`/shopee/${account.id}`} onClick={onNavigate} className={cn("min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors", state.accountActive ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800/70 hover:text-white")}>
                  <span className="block truncate">{account.name}</span>
                </Link>
                <button type="button" aria-label={`${showWorkflows ? "Tutup" : "Buka"} menu ${account.name}`} aria-expanded={showWorkflows} onClick={() => dispatchExpansion({ type: "TOGGLE_ACCOUNT", accountId: account.id })} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-white">
                  {showWorkflows ? <ChevronDown className="size-3.5"/> : <ChevronRight className="size-3.5"/>}
                </button>
              </div>
              {showWorkflows && <div className="ml-2.5 mt-1 space-y-0.5 border-l border-slate-700/50 pl-2.5">
                {shopeeWorkflows.map((workflow) => {
                  const href = workflow.href ? `/shopee/${account.id}/${workflow.href}` : `/shopee/${account.id}`;
                  return <Link key={workflow.key} href={href} onClick={onNavigate} className={cn("relative block rounded-md px-2.5 py-1 text-[13px] transition-colors before:absolute before:-left-2.5 before:top-1/2 before:w-1.5 before:border-t before:border-slate-700/60", state.activeWorkflow === workflow.key ? "bg-blue-500/15 font-medium text-blue-200" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100")}>{workflow.label}</Link>;
                })}
              </div>}
            </div>;
          })}
          {shopeeAccounts.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">Belum ada akun aktif.</p>}
        </div>}
      </NavigationGroup>

      <div className="border-t border-slate-800 pt-4"><StaticNavigationLink item={settingsNavigation} pathname={pathname} onNavigate={onNavigate}/></div>
    </nav>
  </>;
}

function NavigationGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return <section aria-label={label} className="space-y-1">{children}</section>;
}

function StaticNavigationLink({ item, pathname, nested = false, onNavigate }: { item: NavigationItem; pathname: string; nested?: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  const isActive = isNavigationItemActive(pathname, item.href);
  return <Link href={item.href} onClick={onNavigate} className={cn(rootLinkClass, nested && "ml-5", isActive ? activeRootClass : inactiveRootClass)}><Icon className="size-4 shrink-0" aria-hidden="true"/><span className="truncate">{item.label}</span></Link>;
}
