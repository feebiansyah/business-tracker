import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export async function AppShell({ children }: { children: ReactNode }) {
  const shopeeAccounts = await prisma.shopeeAccount.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return <div className="flex min-h-screen bg-[#f6f8fb]"><Sidebar shopeeAccounts={shopeeAccounts} /><div className="min-w-0 flex-1"><Topbar /><main className="mx-auto w-full max-w-7xl p-4 pb-24 sm:p-6 lg:p-8 lg:pb-8">{children}</main></div></div>;
}
