import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { loadOverviewGroup,getGroupPerformance,getGroupReminders } from "@/lib/overview-groups/report";
import { OverviewGroupReport } from "@/components/overview-groups/group-report";
import { getGroupTrafficReport } from "@/lib/overview-groups/traffic";
import { GroupTrafficReport } from "@/components/overview-groups/traffic-report";

export const dynamic = "force-dynamic";
export default async function GroupOverviewPage({ params,searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string,string | string[] | undefined>> }) {
  await requireUser();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const group = await loadOverviewGroup(prisma,id);
  if (!group || group.members.length < 2) notFound();
  const raw = await searchParams,ids = group.members.map((m) => m.shopeeAccountId);
  const wlCount = group.members.reduce((sum,m) => sum + m.shopeeAccount.metaAccounts.length,0);
  const [report,reminders,traffic] = await Promise.all([getGroupPerformance(prisma,group,raw,wlCount),getGroupReminders(prisma,ids),getGroupTrafficReport(prisma,ids,raw)]);
  const search = new URLSearchParams(Object.entries(raw).flatMap(([key,value]) => typeof value === "string" ? [[key,value]] : [])).toString();
  return <div className="min-w-0 space-y-4"><OverviewGroupReport group={group} report={report} reminders={reminders} search={search} /><GroupTrafficReport reports={traffic} accounts={group.members.map((m) => m.shopeeAccount)} search={search} /></div>;
}
