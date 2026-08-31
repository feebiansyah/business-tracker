import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
export function AppShell({ children }: { children: ReactNode }) { return <div className="flex min-h-screen bg-slate-50"><Sidebar /><div className="min-w-0 flex-1"><Topbar /><main className="mx-auto w-full max-w-7xl p-4 pb-24 sm:p-6 lg:p-8 lg:pb-8">{children}</main></div></div>; }
