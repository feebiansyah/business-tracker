"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { getShopeeNavigationState } from "./navigation-state";
import { navigationItems, shopeeNavigation, shopeeWorkflows } from "./navigation";

export type SidebarShopeeAccount = { id: number; name: string };
const rootLinkClass = "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors";

export function Sidebar({ shopeeAccounts }: { shopeeAccounts: SidebarShopeeAccount[] }) {
  const pathname = usePathname();
  const shopeeActive = pathname === "/shopee" || pathname.startsWith("/shopee/");
  const [shopeeExpanded, setShopeeExpanded] = useState(false);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<number>>(() => new Set());
  const ShopeeIcon = shopeeNavigation.icon;
  const showShopeeAccounts = shopeeActive || shopeeExpanded;

  function toggleAccount(accountId: number) {
    setExpandedAccounts((current) => {
      const next = new Set(current);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }

  return (
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
      <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-6">
        <div className="flex size-8 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white">BT</div>
        <span className="font-semibold tracking-tight text-slate-950">Business Tracker</span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Navigasi utama">
        {navigationItems.slice(0, 3).map((item) => <StaticNavigationLink key={item.href} item={item} pathname={pathname} />)}
        <div>
          <div className="flex items-center gap-1">
            <Link href={shopeeNavigation.href} className={cn(rootLinkClass, "min-w-0 flex-1", shopeeActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950")}>
              <ShopeeIcon className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{shopeeNavigation.label}</span>
            </Link>
            <button type="button" aria-label={`${showShopeeAccounts ? "Tutup" : "Buka"} daftar Akun Shopee`} aria-expanded={showShopeeAccounts} onClick={() => setShopeeExpanded((expanded) => !expanded)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-950">
              {showShopeeAccounts ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
          </div>
          {showShopeeAccounts && (
            <div className="ml-5 mt-1 space-y-1 border-l border-slate-200 pl-3">
              {shopeeAccounts.map((account) => {
                const state = getShopeeNavigationState(pathname, account.id);
                const showWorkflows = state.accountActive || expandedAccounts.has(account.id);
                return (
                  <div key={account.id}>
                    <div className="flex items-center gap-1">
                      <Link href={`/shopee/${account.id}`} className={cn("min-w-0 flex-1 rounded-md px-3 py-2 text-sm font-medium", state.accountActive ? "bg-slate-100 text-slate-950" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950")}><span className="block truncate">{account.name}</span></Link>
                      <button type="button" aria-label={`${showWorkflows ? "Tutup" : "Buka"} menu ${account.name}`} aria-expanded={showWorkflows} onClick={() => toggleAccount(account.id)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-950">
                        {showWorkflows ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                      </button>
                    </div>
                    {showWorkflows && (
                      <div className="ml-3 border-l border-slate-200 pl-3">
                        {shopeeWorkflows.map((workflow) => (
                          <Link key={workflow.href} href={`/shopee/${account.id}/${workflow.href}`} className={cn("block rounded-md px-3 py-1.5 text-sm", state.activeWorkflow === workflow.href ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-950")}>{workflow.label}</Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {shopeeAccounts.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">Belum ada akun aktif.</p>}
            </div>
          )}
        </div>
        {navigationItems.slice(3).map((item) => <StaticNavigationLink key={item.href} item={item} pathname={pathname} />)}
      </nav>
      <div className="border-t border-slate-200 px-6 py-4 text-xs text-slate-500">Business Tracker</div>
    </aside>
  );
}

function StaticNavigationLink({ item, pathname }: { item: (typeof navigationItems)[number]; pathname: string }) {
  const Icon = item.icon;
  const isActive = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
  return <Link href={item.href} className={cn(rootLinkClass, isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950")}><Icon className="size-4" aria-hidden="true" />{item.label}</Link>;
}
