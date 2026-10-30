"use client";

import { useState, type ReactNode } from "react";
import { AdsterraOperationProvider, useAdsterraOperation } from "./operation-context";

type WorkspaceTab = "campaign" | "placement" | "settings";
const tabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "campaign", label: "Campaign" },
  { id: "placement", label: "Placement" },
  { id: "settings", label: "Pengaturan" },
];

export function AdsterraWorkspaceTabs({ campaign, placement, settings, protection }: { campaign: ReactNode; placement: ReactNode; settings: ReactNode; protection?: ReactNode }) {
  return <AdsterraOperationProvider><WorkspacePanels campaign={campaign} placement={placement} settings={settings} protection={protection}/></AdsterraOperationProvider>;
}
function WorkspacePanels({ campaign, placement, settings, protection }: { campaign: ReactNode; placement: ReactNode; settings: ReactNode; protection?: ReactNode }) {
  const operation = useAdsterraOperation();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("campaign");

  return <div className="min-w-0 space-y-4">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
    <div className="max-w-full overflow-x-auto" role="tablist" aria-label="Workspace Adsterra">
      <div className="flex min-w-max gap-1">
        {tabs.map((tab) => <button key={tab.id} type="button" role="tab" disabled={operation.busy} aria-selected={activeTab === tab.id} aria-controls={`adsterra-panel-${tab.id}`} className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 ${activeTab === tab.id ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900"}`} onClick={() => { if (!operation.isBusy()) setActiveTab(tab.id); }}>{tab.label}</button>)}
      </div>
    </div>
    {protection}
    </div>
    {tabs.map((tab) => <div key={tab.id} id={`adsterra-panel-${tab.id}`} role="tabpanel" hidden={activeTab !== tab.id} inert={activeTab !== tab.id} aria-label={tab.label} className="min-w-0">{tab.id === "campaign" ? campaign : tab.id === "placement" ? placement : settings}</div>)}
  </div>;
}
