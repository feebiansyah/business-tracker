"use client";

import { useState, type ReactNode } from "react";

type WorkspaceTab = "campaign" | "zone" | "settings";
const tabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "campaign", label: "Campaign" },
  { id: "zone", label: "Zone" },
  { id: "settings", label: "Pengaturan" },
];

export function ClickaduWorkspaceTabs({ campaign, zone, settings }: { campaign: ReactNode; zone: ReactNode; settings: ReactNode }) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("campaign");
  const activeContent = activeTab === "campaign" ? campaign : activeTab === "zone" ? zone : activeTab === "settings" ? settings : null;

  return <div className="min-w-0 space-y-4">
    <div className="overflow-x-auto border-b border-slate-200" role="tablist" aria-label="Workspace Clickadu">
      <div className="flex min-w-max gap-1">
        {tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`clickadu-panel-${tab.id}`} className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === tab.id ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900"}`} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
      </div>
    </div>
    <div id={`clickadu-panel-${activeTab}`} role="tabpanel" aria-label={tabs.find((tab) => tab.id === activeTab)?.label} className="min-w-0">{activeContent}</div>
  </div>;
}
