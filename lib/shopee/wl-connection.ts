import "server-only";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { lockShopeeAccounts } from "./account-lock";

export class WlConnectionError extends Error {}

export async function moveWlConnection(db: Pick<PrismaClient, "$transaction">, metaAccountId: number, source: number | null, destination: number | null) {
  if (!Number.isSafeInteger(metaAccountId) || metaAccountId <= 0 || [source,destination].some(id=>id !== null && (!Number.isSafeInteger(id) || id <= 0))) throw new WlConnectionError("Data WL atau Akun Shopee tidak valid.");
  return db.$transaction(async tx=>{
    const ids = [source,destination].filter((id): id is number=>id !== null);
    try { await lockShopeeAccounts(tx,ids); }
    catch { throw new WlConnectionError("Akun Shopee yang dipilih tidak ditemukan atau sedang terkunci. Coba lagi."); }
    const [wl] = await tx.$queryRaw<{ id: number; shopeeAccountId: number | null }[]>`SELECT id, shopeeAccountId FROM MetaAccount WHERE id = ${metaAccountId} FOR UPDATE`;
    if (!wl) throw new WlConnectionError("WL tidak ditemukan.");
    if (wl.shopeeAccountId === destination) return { source: wl.shopeeAccountId, destination, changed: false };
    if (wl.shopeeAccountId !== source) throw new WlConnectionError("Koneksi WL sudah berubah. Muat ulang sebelum memindahkan WL.");
    const where = { OR: [{ activeShopeeAccountId: { in: ids } }, { shopeeAccountId: { in: ids }, status: { in: ["RUNNING","PAUSED_RATE_LIMIT"] } }] };
    const [sync,snapshot] = await Promise.all([
      tx.metaSyncRun.findFirst({ where, select: { id: true } }),
      tx.metaPrefilterRun.findFirst({ where, select: { id: true } }),
    ]);
    if (sync || snapshot) throw new WlConnectionError("Sync Meta atau snapshot masih aktif/dijeda pada akun asal atau tujuan. Selesaikan proses tersebut sebelum memindahkan WL.");
    if (source !== null && destination !== null) {
      // Snapshot-only campaigns may already have a manual type, without a
      // permanent Campaign yet. Read identity only; their old rows stay put.
      const snapshotIds = await tx.metaPrefilterRow.findMany({ where: { metaAccountId }, select: { metaCampaignId: true }, distinct: ["metaCampaignId"] });
      const campaigns = await tx.campaign.findMany({ where: { OR: [{ metaAccountId }, { metaCampaignId: { in: snapshotIds.map(r=>r.metaCampaignId) } }] }, select: { metaCampaignId: true, metaAccountId: true } });
      const elsewhere = new Set(campaigns.filter(c=>c.metaAccountId !== metaAccountId).map(c=>c.metaCampaignId));
      const campaignIds = [...new Set([...campaigns.filter(c=>c.metaAccountId === metaAccountId).map(c=>c.metaCampaignId),...snapshotIds.map(r=>r.metaCampaignId).filter(id=>!elsewhere.has(id))])];
      if (campaignIds.length) {
        const overrides = await tx.campaignPostTypeOverride.findMany({ where: { shopeeAccountId: { in: [source,destination] }, metaCampaignId: { in: campaignIds } } });
        const target = new Map(overrides.filter(r=>r.shopeeAccountId === destination).map(r=>[r.metaCampaignId,r.manualType]));
        const originals = overrides.filter(r=>r.shopeeAccountId === source);
        const conflict = originals.find(r=>target.has(r.metaCampaignId) && target.get(r.metaCampaignId) !== r.manualType);
        if (conflict) throw new WlConnectionError(`Konflik Jenis campaign ${conflict.metaCampaignId}: pilihan akun asal dan tujuan berbeda. Pemindahan dibatalkan; sesuaikan pilihan Jenis terlebih dahulu.`);
        const missing = originals.filter(r=>!target.has(r.metaCampaignId));
        if (missing.length) await tx.campaignPostTypeOverride.createMany({ data: missing.map(r=>({...r,shopeeAccountId:destination})) });
        if (originals.length) await tx.campaignPostTypeOverride.deleteMany({ where: { shopeeAccountId: source, metaCampaignId: { in: originals.map(r=>r.metaCampaignId) } } });
      }
    }
    const moved = await tx.metaAccount.updateMany({ where: { id: metaAccountId, shopeeAccountId: source }, data: { shopeeAccountId: destination } });
    if (moved.count !== 1) throw new WlConnectionError("Koneksi WL berubah. Pemindahan dibatalkan; muat ulang dan coba lagi.");
    return { source, destination, changed: true };
  },{ isolationLevel: "ReadCommitted", maxWait: 5_000, timeout: 15_000 });
}
