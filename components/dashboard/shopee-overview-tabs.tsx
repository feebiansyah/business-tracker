"use client";

import { useRef, useTransition, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { shopeeOverviewTabs, type ShopeeOverviewTab } from "@/lib/dashboard/shopee-overview-params";

const labels = { meta: "Meta", clickadu: "Clickadu", adsterra: "Adsterra" };

export function ShopeeOverviewTabs({ accountId, activeTab, hrefs, panels }: {
  accountId: number;
  activeTab: ShopeeOverviewTab;
  hrefs: Record<ShopeeOverviewTab, string>;
  panels: Record<ShopeeOverviewTab, ReactNode>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const buttons = useRef<Partial<Record<ShopeeOverviewTab, HTMLButtonElement>>>({});
  const select = (tab: ShopeeOverviewTab) => {
    if (tab !== activeTab || pending) startTransition(() => router.push(hrefs[tab], { scroll: false }));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: ShopeeOverviewTab) => {
    const index = shopeeOverviewTabs.indexOf(tab);
    let target: ShopeeOverviewTab;
    if (event.key === "ArrowRight") target = shopeeOverviewTabs[(index + 1) % shopeeOverviewTabs.length];
    else if (event.key === "ArrowLeft") target = shopeeOverviewTabs[(index + shopeeOverviewTabs.length - 1) % shopeeOverviewTabs.length];
    else if (event.key === "Home") target = "meta";
    else if (event.key === "End") target = "adsterra";
    else return;
    event.preventDefault();
    buttons.current[target]?.focus();
    select(target);
  };
  return <div className="min-w-0 space-y-4">
    <div role="tablist" aria-label="Overview berdasarkan provider" className="flex flex-wrap gap-1 border-b border-slate-200">
      {shopeeOverviewTabs.map((tab) => <button
        key={tab} ref={(node) => { if (node) buttons.current[tab] = node; else delete buttons.current[tab]; }}
        type="button" role="tab" id={`overview-tab-${accountId}-${tab}`}
        aria-controls={`overview-panel-${accountId}-${tab}`} aria-selected={tab === activeTab}
        tabIndex={tab === activeTab ? 0 : -1} onClick={() => select(tab)} onKeyDown={(event) => onKeyDown(event, tab)}
        className={`rounded-t-md border-b-2 px-4 py-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-blue-500 ${tab === activeTab ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900"}`}
      >{labels[tab]}</button>)}
    </div>
    {shopeeOverviewTabs.map((tab) => <div key={tab} role="tabpanel" id={`overview-panel-${accountId}-${tab}`}
      aria-labelledby={`overview-tab-${accountId}-${tab}`} aria-busy={tab === activeTab && pending}
      tabIndex={0} hidden={tab !== activeTab} className="min-w-0 focus-visible:outline-2 focus-visible:outline-blue-500"
    >{panels[tab]}</div>)}
  </div>;
}
