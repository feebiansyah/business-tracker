import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "../prisma";
import { resolveSessionUser, SESSION_COOKIE_NAME } from "../auth/session-core";
import { decryptTrafficSecret } from "../traffic-credentials/crypto";
import { parseAdsterraConfigId, parseShopeeAccountId } from "../adsterra-roi/config-input";
import { buildAdsterraRoiAnalysis } from "../adsterra-roi/analyze";
import { readCsvUpload } from "../shopee-import/upload";
import { campaignKey, digest } from "./canonical";
import { OperationBudget } from "./budget";
import { CampaignOperationStore } from "./repository";
import { PlacementProvider } from "./provider";
import { planApplication } from "./application";
import { OperationError, type ListKind, type MethodState, type Snapshot } from "./types";
import { requireActivationReady } from "./method-state";
import { isLegacyUnconfiguredMethod } from "./method-activation";
import type { PrismaClient } from "../generated/prisma/client";
import type { Fence } from "./repository";
import { AutoNotDispatched, disableMethodAuto } from "./method-auto";

export async function requireOperationUser(budget: OperationBudget) {
  let user: Awaited<ReturnType<typeof resolveSessionUser>>;
  try {
    const token = (await budget.wait(cookies())).get(SESSION_COOKIE_NAME)?.value;
    user = token ? await budget.wait(resolveSessionUser(token, new Date(), {
    findSession: (tokenHash) => { budget.check(); return prisma.session.findUnique({ where: { tokenHash }, select: {
      tokenHash: true, expiresAt: true, user: { select: { id: true, name: true, email: true, isActive: true } },
    } }); }, deleteSession: async () => { /* Same expiry rejection, SELECT-only auth for this flow. */ },
    })) : null;
  } catch { throw new OperationError("Autentikasi belum dapat diverifikasi dalam batas waktu. Tidak ada write provider dijalankan."); }
  if (!user) redirect("/login");
  return String(user.id);
}
export function parseListKind(value: unknown): ListKind {
  if (value !== "BLACKLIST" && value !== "WHITELIST") throw new OperationError("Jenis daftar tidak valid.");
  return value;
}
export async function loadOperationScope(account: unknown, config: unknown, budget: OperationBudget, db: Pick<PrismaClient, "adsterraCampaignConfig"> = prisma) {
  const shopeeAccountId = parseShopeeAccountId(account), configId = parseAdsterraConfigId(config);
  const row = await budget.wait(db.adsterraCampaignConfig.findFirst({ where: { id: configId, shopeeAccountId }, include: {
    shopeeAccount: { select: { trafficCredentials: { where: { provider: "ADSTERRA" }, select: { id: true, encryptedSecret: true, updatedAt: true } } } },
  } }));
  if (!row) throw new OperationError("Konfigurasi dalam scope akun Shopee tidak ditemukan.");
  const credential = row.shopeeAccount.trafficCredentials[0];
  if (!credential) throw new OperationError("Credential Adsterra belum terhubung.");
  const campaignId = campaignKey(row.campaignId);
  const all = await budget.wait(db.adsterraCampaignConfig.findMany({ select: { id: true, shopeeAccountId: true, campaignId: true, autoScheduleEnabled: true }, orderBy: { id: "asc" } }));
  const aliases = all.filter((alias) => { try { return campaignKey(alias.campaignId) === campaignId; } catch { return false; } });
  return { scope: { shopeeAccountId, configId, campaignId, label: row.label || campaignId, sourceTag: row.sourceTag }, row, aliases,
    token: decryptTrafficSecret(credential.encryptedSecret),
    scopeHash: digest([row.id, row.shopeeAccountId, campaignId, row.sourceTag, row.label, row.updatedAt, credential.id, credential.updatedAt, digest(credential.encryptedSecret)]),
  };
}
export async function operationContext(account: unknown, config: unknown, budget: OperationBudget) {
  const loaded = await loadOperationScope(account, config, budget);
  let authorized = loaded;
  const store = new CampaignOperationStore(prisma, budget);
  const provider = new PlacementProvider(loaded.token, loaded.scope.campaignId, budget, store);
  provider.beforeMutation = async () => {
    const fresh = await loadOperationScope(account, config, budget);
    if (fresh.scopeHash !== authorized.scopeHash) throw new OperationError("Scope/credential/config berubah sebelum write; konfirmasi ulang.");
    if (provider.requireInactive && (fresh.aliases.some((a) => a.autoScheduleEnabled) || (await provider.campaign()).active !== 1)) throw new OperationError("Prasyarat clear berubah: strictly INACTIVE dan semua Auto harus tetap nonaktif.");
  };
  async function disableAuto(fence: Fence, expected: Snapshot) {
    if (expected.scopeHash !== authorized.scopeHash || digest(expected.aliases) !== digest(authorized.aliases)) throw new OperationError("Scope reset berubah.");
    try {
      authorized = await disableMethodAuto(prisma, store, budget, fence, authorized, (tx) => loadOperationScope(account, config, budget, tx), provider.expiresAt ?? 0);
      return { scopeHash: authorized.scopeHash, aliases: authorized.aliases };
    } catch (error) { if (error instanceof AutoNotDispatched) provider.notDispatchedStatus = error.status; else provider.ambiguous = true; throw error; }
  }
  async function snapshot(): Promise<Snapshot> {
    // Observe the ORIGINAL physical campaign even if DB scope/flags changed while
    // a request was in flight. Observation is not authorization for another write.
    const campaign = await provider.campaign();
    const blacklist = await provider.list("BLACKLIST"), whitelist = await provider.list("WHITELIST");
    const bids = await provider.legacy.getCustomBids(loaded.scope.campaignId);
    const method = await store.method(loaded.scope.campaignId);
    try {
      const fresh = await loadOperationScope(account, config, budget);
      return { campaign, blacklist, whitelist, bids, method, aliases: fresh.aliases,
        scopeHash: fresh.scope.campaignId === loaded.scope.campaignId ? fresh.scopeHash : "SCOPE_CHANGED" };
    } catch { return { campaign, blacklist, whitelist, bids, method, aliases: loaded.aliases, scopeHash: "SCOPE_UNAVAILABLE" }; }
  }
  async function activationReady() {
    const method = await store.method(loaded.scope.campaignId);
    // First setup also retains null while its durable version has advanced.
    // Only untouched legacy defaults may bypass method readiness. The shared
    // reserve/assert guard still blocks pending/uncertain operations.
    if (isLegacyUnconfiguredMethod(method)) return method;
    budget.requireRequests(3);
    const campaign = await provider.campaign(), blacklist = await provider.list("BLACKLIST"), whitelist = await provider.list("WHITELIST");
    return requireActivationReady({ method, campaign, blacklist, whitelist });
  }
  function bindMethod(expected: MethodState, placement = false) {
    const original = provider.beforeMutation;
    provider.beforeMutation = async () => {
      await original?.();
      if (digest(await store.method(loaded.scope.campaignId)) !== digest(expected)) throw new OperationError("Metode/versi/kesiapan berubah sebelum dispatch.");
      if (placement && (await provider.list(expected.placementMethod === "BLACKLIST" ? "WHITELIST" : "BLACKLIST")).length) throw new OperationError("Daftar berlawanan terisi; Placement tidak boleh clear. Kembali ke Campaign.");
    };
  }
  async function plan(data: FormData, kind: ListKind) {
    const method = await store.method(loaded.scope.campaignId);
    if (!method.placementMethod || method.placementMethod !== kind) throw new OperationError("Placement harus mengikuti metode tersimpan. Tetapkan/ubah metode di Campaign.");
    const upload = await budget.wait(readCsvUpload(loaded.scope.shopeeAccountId, data));
    const analysis = await buildAdsterraRoiAnalysis({ shopeeAccountId: loaded.scope.shopeeAccountId, configId: loaded.scope.configId,
      dateFrom: data.get("dateFrom"), dateTill: data.get("dateTill"), fxRate: data.get("fxRate"), ...upload }, {
      loadConfig: async () => { const fresh = await loadOperationScope(account, config, budget); return fresh.row; },
      getStatistics: (input) => { budget.check(); if (campaignKey(input.campaignId) !== loaded.scope.campaignId) throw new OperationError("Scope statistik berubah."); return provider.legacy.getPlacementStatistics({ ...input, campaignId: loaded.scope.campaignId }); },
    });
    budget.check();
    return planApplication({ scope: loaded.scope, kind, rows: analysis.analysis.rows, before: await snapshot(),
      dateFrom: analysis.dateFrom, dateTill: analysis.dateTill, fxRate: analysis.fxRate,
      inputHash: digest([digest(Buffer.from(upload.bytes).toString("base64")), analysis.dateFrom, analysis.dateTill, analysis.fxRate, loaded.scope]),
    });
  }
  return { ...loaded, budget, provider, store, snapshot, plan, activationReady, bindMethod, disableAuto };
}
export function publicOperationError(error: unknown) {
  return error instanceof OperationError ? error.message
    : "Operasi Adsterra tidak dapat dilanjutkan. Periksa scope/koneksi dan kesiapan migrasi guard; tidak ada retry write otomatis.";
}
