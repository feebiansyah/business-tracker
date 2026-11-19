import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { OverviewGroupForm } from "@/components/overview-groups/group-form";

export default async function SettingsPage() {
  await requireUser();
  const [accounts,groups] = await Promise.all([
    prisma.shopeeAccount.findMany({ select: { id: true,name: true,overviewGroupMember: { select: { groupId: true } } },orderBy: { name: "asc" } }),
    prisma.shopeeOverviewGroup.findMany({ include: { members: { select: { shopeeAccountId: true } } },orderBy: { name: "asc" } }),
  ]);
  const choices = accounts.map((a) => ({ id: a.id,name: a.name,groupId: a.overviewGroupMember?.groupId ?? null }));
  return <section className="min-w-0 space-y-4"><h2 className="text-2xl font-semibold text-slate-950">Settings</h2>
    <section aria-label="Overview Gabungan" className="space-y-3"><h3 className="text-lg font-semibold">Overview Gabungan</h3>
      <div className="grid min-w-0 items-start gap-3 md:grid-cols-2">
        {groups.map((g) => <OverviewGroupForm key={`${g.id}:${g.updatedAt.toISOString()}`} accounts={choices} group={{ id: g.id,name: g.name,memberIds: g.members.map((m) => m.shopeeAccountId) }} />)}
        <div className="min-w-0 space-y-2"><h4 className="text-sm font-medium">Grup baru</h4><OverviewGroupForm accounts={choices} /></div>
      </div>
    </section>
  </section>;
}
