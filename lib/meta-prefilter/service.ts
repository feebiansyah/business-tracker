import "server-only";
import { Prisma, type PrismaClient, type MetaPrefilterRun } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { MetaGraphClient, MetaApiError, MetaSyncPauseError } from "@/lib/meta/client";
import type { MetaCampaign, MetaCampaignInsight } from "@/lib/meta/types";
import { META_SYNC_HTTP_MS, META_SYNC_LEASE_MS, META_SYNC_UNIT_MS } from "@/lib/filter/meta-sync-state";
import { retryMetaSyncTransaction } from "@/lib/filter/persistence";
import { accountId, businessDate, cpc, dateValue, metaId, nameValue, readInsight, slotValue, statusValue } from "./model";
import type { PrefilterBatch, PrefilterData, PrefilterProgress, PrefilterSlot } from "./types";

type Db = Pick<PrismaClient, "shopeeAccount" | "metaPrefilterRun" | "metaPrefilterRow" | "$transaction">;
type Tx = Pick<Prisma.TransactionClient, "shopeeAccount" | "metaPrefilterRun" | "metaPrefilterRow">;
type Scope = { id: number; name: string; accountId: string }[];
type Cursor = { index: number; phase: "CAMPAIGNS" | "INSIGHTS" | "SKIP" | "PRUNE" | "PUBLISH"; after?: string; seen?: string[]; skipReason?: string };
type Client = Pick<MetaGraphClient, "getSyncPage" | "restoreSyncUsagePercent" | "getSyncUsagePercent">;
type Deps = { db: Db; clientFactory: () => Client; now: () => Date };
class SafeError extends Error {}
class DayChanged extends Error {}
const initialCursor: Cursor = { index: 0, phase: "CAMPAIGNS" };
const transient = (e: unknown) => e instanceof MetaApiError && [4,17,32,613].includes(e.code ?? -1);
const skippedNames = (run: MetaPrefilterRun) => run.skipped as string[];
const scopeOf = (run: MetaPrefilterRun) => run.scope as unknown as Scope;
const logicalDate = (run: MetaPrefilterRun) => run.businessDate.toISOString().slice(0,10);
function progress(run: MetaPrefilterRun): PrefilterProgress {
  const scope = scopeOf(run), cursor = run.cursor as unknown as Cursor;
  return { runId: run.id, slot: slotValue(run.slot), businessDate: logicalDate(run), requestedAt: run.requestedAt.toISOString(), status: run.status, current: Math.min(cursor.index+1,scope.length), total: scope.length, pages: run.pages, skipped: skippedNames(run), message: run.error };
}
async function accountScope(db: Tx, id: number) {
  const account = await db.shopeeAccount.findUnique({ where: { id }, select: { id: true, name: true, metaAccounts: { select: { id: true, name: true, accountId: true }, orderBy: { id: "asc" } } } });
  if (!account) throw new SafeError("Akun Shopee tidak ditemukan.");
  return account;
}
function validScope(wls: Scope): Scope { return wls.map(w => ({ id: w.id, name: w.name.slice(0,191), accountId: accountId(w.accountId) })).sort((a,b)=>a.id-b.id); }
function sameScope(a: Scope,b: Scope) { return a.length === b.length && a.every((w,i)=>w.id === b[i].id && w.accountId === b[i].accountId); }

export async function readPrefilterData(shopeeAccountId: number, db: Db = prisma, now = new Date()): Promise<PrefilterData> {
  if (!Number.isSafeInteger(shopeeAccountId) || shopeeAccountId <= 0) throw new SafeError("Akun Shopee tidak valid.");
  return db.$transaction(async tx => {
  const account = await accountScope(tx,shopeeAccountId), date = businessDate(now);
  const [awal,akhir,active] = await Promise.all([
    tx.metaPrefilterRun.findFirst({ where: { shopeeAccountId, businessDate: dateValue(date), slot: "AWAL", status: "COMPLETE" }, orderBy: { revision: "desc" } }),
    tx.metaPrefilterRun.findFirst({ where: { shopeeAccountId, businessDate: dateValue(date), slot: "AKHIR", status: "COMPLETE" }, orderBy: { revision: "desc" } }),
    tx.metaPrefilterRun.findUnique({ where: { activeShopeeAccountId: shopeeAccountId } }),
  ]);
  const ids = [awal?.id,akhir?.id].filter((id): id is string => !!id);
  const rows = ids.length ? await tx.metaPrefilterRow.findMany({ where: { runId: { in: ids }, spend: { gt: 0 } }, orderBy: [{ campaignName: "asc" }, { metaCampaignId: "asc" }] }) : [];
  const snapshot = (run: MetaPrefilterRun | null) => run ? { runId: run.id, requestedAt: run.requestedAt.toISOString(), finishedAt: run.finishedAt!.toISOString(), skipped: skippedNames(run), rows: rows.filter(r=>r.runId === run.id).map(r=>({ metaCampaignId: r.metaCampaignId, campaignName: r.campaignName, metaAccountId: r.metaAccountId, wlName: r.wlName, configuredStatus: r.configuredStatus, effectiveStatus: r.effectiveStatus, spend: r.spend!.toString(), withFee: new Prisma.Decimal(r.spend!.toString()).mul("1.05").toString(), clicks: r.clicks?.toString() ?? null, cpc: cpc(r.spend!.toString(),r.clicks) })) } : null;
  return { account: { id: account.id, name: account.name }, businessDate: date, snapshots: { AWAL: snapshot(awal), AKHIR: snapshot(akhir) }, progress: active && logicalDate(active) === date ? progress(active) : null };
  },{ isolationLevel: "RepeatableRead", maxWait: 5_000, timeout: 10_000 });
}

// Called only inside the publication transaction, while its account-wide lease is fenced.
async function cleanup(tx: Tx, account: number, date: Date, keep: string[]) {
  const stale = { shopeeAccountId: account, businessDate: { lte: date }, activeShopeeAccountId: null, id: { notIn: keep } };
  const rows = await tx.metaPrefilterRow.findMany({ where: { run: stale }, select: { id: true }, orderBy: { id: "asc" }, take: 100 });
  if (rows.length) await tx.metaPrefilterRow.deleteMany({ where: { id: { in: rows.map(r=>r.id) } } });
  const runs = await tx.metaPrefilterRun.findMany({ where: { ...stale, rows: { none: {} } }, select: { id: true }, orderBy: { id: "asc" }, take: 10 });
  if (runs.length) await tx.metaPrefilterRun.deleteMany({ where: { id: { in: runs.map(r=>r.id) } } });
}

export async function runPrefilterBatch(input: { shopeeAccountId: number; slot: PrefilterSlot; runId?: string; owner: string; receivedAt: Date; startedAt: number }, dependencies?: Deps): Promise<PrefilterBatch> {
  const { db, clientFactory, now } = dependencies ?? { db: prisma, clientFactory: () => new MetaGraphClient(), now: () => new Date() };
  const slot = slotValue(input.slot), id = input.shopeeAccountId, today = businessDate(now());
  if (!Number.isSafeInteger(id) || id <= 0 || !input.owner || input.owner.length > 64 || (input.runId && !/^[\w-]{1,64}$/.test(input.runId))) throw new SafeError("Permintaan PraFilter tidak valid.");
  if (Date.now()-input.startedAt >= META_SYNC_UNIT_MS) throw new SafeError("Batas waktu habis sebelum pembacaan. Coba lanjutkan snapshot.");
  const account = await accountScope(db,id), liveScope = validScope(account.metaAccounts);
  let run: MetaPrefilterRun | null;
  if (input.runId) {
    run = await db.metaPrefilterRun.findFirst({ where: { id: input.runId, shopeeAccountId: id, slot } });
    if (!run) throw new SafeError("Snapshot tidak ditemukan dalam akun/slot ini.");
  } else {
    let active = await db.metaPrefilterRun.findUnique({ where: { activeShopeeAccountId: id } });
    if (active && logicalDate(active) !== today && (!active.leaseExpiresAt || +active.leaseExpiresAt <= +now())) {
      await db.metaPrefilterRun.updateMany({ where: { id: active.id, generation: active.generation, OR: [{ leaseOwner: null }, { leaseExpiresAt: { lte: now() } }] }, data: { status: "EXPIRED", activeShopeeAccountId: null, generation: { increment: 1 }, leaseOwner: null, leaseExpiresAt: null, error: "Tanggal berganti. Ambil snapshot hari ini." } });
      active = await db.metaPrefilterRun.findUnique({ where: { activeShopeeAccountId: id } });
    }
    if (active) {
      if (active.slot !== slot || logicalDate(active) !== today) return { progress: progress(active), shouldContinue: false, blocked: true };
      run = active;
    } else {
      if (businessDate(input.receivedAt) !== today) throw new SafeError("Tanggal berganti. Klik snapshot lagi untuk hari ini.");
      try {
        run = await db.$transaction(async tx => {
          const latest = await tx.metaPrefilterRun.findFirst({ where: { shopeeAccountId: id, businessDate: dateValue(today), slot }, orderBy: { revision: "desc" }, select: { revision: true } });
          return tx.metaPrefilterRun.create({ data: { shopeeAccountId: id, activeShopeeAccountId: id, businessDate: dateValue(today), slot, revision: (latest?.revision ?? 0)+1, requestedAt: input.receivedAt, scope: liveScope, cursor: initialCursor, skipped: [] } });
        },{ maxWait: 5_000, timeout: 10_000 });
      } catch (e) {
        if ((e as { code?: string }).code !== "P2002") throw e;
        run = await db.metaPrefilterRun.findUnique({ where: { activeShopeeAccountId: id } });
        if (!run) throw new SafeError("Snapshot baru bertabrakan. Baca ulang dan coba lagi.");
        if (run.slot !== slot) return { progress: progress(run), shouldContinue: false, blocked: true };
      }
    }
  }
  const result = async (shouldContinue = false, blocked = false) => {
    const stored = await db.metaPrefilterRun.findFirst({ where: { id: run!.id, shopeeAccountId: id } });
    if (!stored) throw new SafeError("Progres snapshot tidak tersedia.");
    return { progress: progress(stored), shouldContinue: shouldContinue && stored.status === "RUNNING", blocked };
  };
  if (!["RUNNING","PAUSED_RATE_LIMIT"].includes(run.status)) return result();
  const claimed = await db.metaPrefilterRun.updateMany({ where: { id: run.id, status: { in: ["RUNNING","PAUSED_RATE_LIMIT"] }, OR: [{ leaseOwner: null }, { leaseExpiresAt: { lte: now() } }] }, data: { generation: { increment: 1 }, leaseOwner: input.owner, leaseExpiresAt: new Date(+now()+META_SYNC_LEASE_MS) } });
  if (claimed.count !== 1) return result(false,true);
  const lease = await db.metaPrefilterRun.findFirst({ where: { id: run.id, leaseOwner: input.owner } });
  if (!lease) return result(false,true);
  const controller = new AbortController(), deadline = input.startedAt+META_SYNC_UNIT_MS;
  const timer = setTimeout(()=>controller.abort(new MetaSyncPauseError("DEADLINE")),Math.max(0,deadline-Date.now()));
  let client: Client | undefined;
  const check = () => { controller.signal.throwIfAborted(); if (Date.now() >= deadline) throw new MetaSyncPauseError("DEADLINE"); if (businessDate(now()) !== logicalDate(lease)) throw new DayChanged(); };
  const transaction = <T>(body: (tx: Tx) => Promise<T>) => retryMetaSyncTransaction(()=>db.$transaction(async tx=>{
    controller.signal.throwIfAborted();
    const fence = await tx.metaPrefilterRun.updateMany({ where: { id: lease.id, generation: lease.generation, leaseOwner: input.owner, leaseExpiresAt: { gt: now() }, status: { in: ["RUNNING","PAUSED_RATE_LIMIT"] } }, data: { leaseOwner: input.owner } });
    if (fence.count !== 1) throw new SafeError("Progres telah diambil permintaan lain. Baca ulang snapshot.");
    return body(tx);
  },{ maxWait: 5_000, timeout: 10_000 }),controller.signal);
  const scope = scopeOf(lease), cursor = lease.cursor as unknown as Cursor;
  const save = (tx: Tx,next: Cursor,extra: Prisma.MetaPrefilterRunUpdateManyMutationInput = {}) => tx.metaPrefilterRun.updateMany({ where: { id: lease.id, generation: lease.generation, leaseOwner: input.owner }, data: { cursor: next as unknown as Prisma.InputJsonValue, status: "RUNNING", error: null, usagePercent: client?.getSyncUsagePercent() ?? lease.usagePercent, ...extra } });
  try {
    check();
    if (!sameScope(scope,liveScope)) throw new SafeError("Daftar WL berubah. Snapshot dibatalkan; ambil snapshot baru.");
    const wl = scope[cursor.index];
    if (cursor.phase === "PRUNE" || cursor.phase === "SKIP") {
      const where = cursor.phase === "SKIP" ? { runId: lease.id, metaAccountId: wl.id } : { runId: lease.id, OR: [{ spend: null }, { spend: { lte: 0 } }] };
      await transaction(async tx=>{
        check(); const rows = await tx.metaPrefilterRow.findMany({ where, select: { id: true }, take: 100, orderBy: { id: "asc" } });
        if (rows.length) await tx.metaPrefilterRow.deleteMany({ where: { id: { in: rows.map(r=>r.id) } } });
        const next = rows.length === 100 ? cursor : cursor.phase === "SKIP" ? { index: cursor.index+1, phase: "CAMPAIGNS" as const } : { ...cursor, phase: "PUBLISH" as const };
        await save(tx,next,cursor.phase === "SKIP" && rows.length < 100 ? { skipped: [...skippedNames(lease),cursor.skipReason ?? `${wl.name}: tidak dapat dibaca`] } : {}); check();
      });
    } else if (cursor.phase === "PUBLISH") {
      await transaction(async tx=>{
        check(); const fresh = validScope((await accountScope(tx,id)).metaAccounts);
        if (!sameScope(scope,fresh)) throw new SafeError("Daftar WL berubah. Ambil snapshot baru.");
        if (skippedNames(lease).length) {
          await tx.metaPrefilterRun.updateMany({ where: { id: lease.id, generation: lease.generation, leaseOwner: input.owner }, data: { status: "PARTIAL", finishedAt: now(), activeShopeeAccountId: null, error: "Sebagian WL tidak dapat dibaca. Snapshot COMPLETE sebelumnya tetap ditampilkan." } });
          return;
        }
        await tx.metaPrefilterRun.updateMany({ where: { id: lease.id, generation: lease.generation, leaseOwner: input.owner }, data: { status: "COMPLETE", finishedAt: now(), activeShopeeAccountId: null, error: null } });
        const other = await tx.metaPrefilterRun.findFirst({ where: { shopeeAccountId: id, businessDate: lease.businessDate, slot: slot === "AWAL" ? "AKHIR" : "AWAL", status: "COMPLETE" }, orderBy: { revision: "desc" }, select: { id: true } });
        await cleanup(tx,id,lease.businessDate,[lease.id,...(other?[other.id]:[])]); check();
      });
      return result();
    } else if (!wl) {
      await transaction(tx=>save(tx,{ ...cursor,phase: "PRUNE" }));
    } else {
      client = clientFactory(); client.restoreSyncUsagePercent(lease.usagePercent);
      const options = { deadline: Math.min(input.startedAt+META_SYNC_HTTP_MS,deadline-15_000), signal: controller.signal, after: cursor.after };
      const kind = cursor.phase === "CAMPAIGNS" ? "campaigns" : "insights";
      const page = await client.getSyncPage<MetaCampaign | MetaCampaignInsight>(kind,wl.accountId,kind === "insights" ? { since: logicalDate(lease), until: logicalDate(lease) } : undefined,options);
      check();
      if (!Array.isArray(page.data) || page.data.length > 100 || (page.after && (page.after.length > 8192 || page.after === cursor.after || cursor.seen?.includes(page.after)))) throw new SafeError("Pagination Meta tidak valid. Snapshot lama dipertahankan.");
      if ((cursor.seen?.length ?? 0) >= 1000) throw new SafeError("Batas halaman WL tercapai. Snapshot lama dipertahankan.");
      const ids = page.data.map(r=>metaId("id" in r ? r.id : r.campaign_id));
      if (new Set(ids).size !== ids.length) throw new SafeError("Meta mengirim campaign ganda dalam satu halaman.");
      await transaction(async tx=>{
        check();
        const existing = ids.length ? await tx.metaPrefilterRow.findMany({ where: { runId: lease.id, metaCampaignId: { in: ids } } }) : [];
        if (existing.some(r=>r.metaAccountId !== wl.id)) throw new SafeError("Relasi campaign/WL berubah. Snapshot tidak diterapkan.");
        const data: Prisma.MetaPrefilterRowCreateManyInput[] = [];
        for (const raw of page.data) {
          const campaignId = metaId("id" in raw ? raw.id : raw.campaign_id), old = existing.find(r=>r.metaCampaignId === campaignId);
          const base = { runId: lease.id, metaCampaignId: campaignId, metaAccountId: wl.id, accountId: wl.accountId, wlName: wl.name };
          if (kind === "campaigns") {
            const row = raw as MetaCampaign;
            data.push({ ...base,campaignName: nameValue(row.name,campaignId), configuredStatus: statusValue(row.status),effectiveStatus: statusValue(row.effective_status) });
          } else {
            const row = readInsight(raw as MetaCampaignInsight,logicalDate(lease));
            if (row) data.push({ ...base,campaignName: old?.campaignName ?? row.campaignName,configuredStatus: old?.configuredStatus ?? null,effectiveStatus: old?.effectiveStatus ?? null,spend: row.spend,clicks: row.clicks });
          }
        }
        if (ids.length) await tx.metaPrefilterRow.deleteMany({ where: { runId: lease.id,metaCampaignId: { in: ids } } });
        if (data.length) await tx.metaPrefilterRow.createMany({ data });
        const next: Cursor = page.after ? { ...cursor,after: page.after,seen: [...(cursor.seen ?? []),...(cursor.after?[cursor.after]:[])] } : kind === "campaigns" ? { index: cursor.index,phase: "INSIGHTS" } : { index: cursor.index+1,phase: "CAMPAIGNS" };
        await save(tx,next,{ pages: { increment: 1 } }); check();
      });
    }
    return result(true);
  } catch (error) {
    if (controller.signal.aborted || error instanceof MetaSyncPauseError || transient(error)) {
      await transaction(tx=>tx.metaPrefilterRun.updateMany({ where: { id: lease.id,generation: lease.generation,leaseOwner: input.owner }, data: { status: transient(error) || error instanceof MetaSyncPauseError && error.rateLimited ? "PAUSED_RATE_LIMIT" : "RUNNING",usagePercent: client?.getSyncUsagePercent() ?? lease.usagePercent,error: "Pengambilan dijeda. Snapshot lama tetap tampil; klik slot untuk melanjutkan." } })).catch(()=>{});
      return result();
    }
    if (error instanceof MetaApiError && [10,100,200].includes(error.code ?? -1) && scope[cursor.index]) {
      await transaction(tx=>save(tx,{ index: cursor.index,phase: "SKIP",skipReason: `${scope[cursor.index].name}: tidak dapat dibaca (kode ${error.code})` }));
      return result(true);
    }
    await transaction(tx=>tx.metaPrefilterRun.updateMany({ where: { id: lease.id,generation: lease.generation,leaseOwner: input.owner }, data: { status: error instanceof DayChanged ? "EXPIRED" : "FAILED",activeShopeeAccountId: null,error: error instanceof DayChanged ? "Tanggal berganti. Ambil snapshot hari ini." : error instanceof SafeError ? error.message : "Pengambilan snapshot gagal. Snapshot COMPLETE sebelumnya tetap ditampilkan." } })).catch(()=>{});
    return result();
  } finally {
    clearTimeout(timer);
    // Await all HTTP/retry/transactions before releasing. Never abandon an active pipeline.
    await db.metaPrefilterRun.updateMany({ where: { id: lease.id,generation: lease.generation,leaseOwner: input.owner }, data: { leaseOwner: null,leaseExpiresAt: null } });
  }
}
