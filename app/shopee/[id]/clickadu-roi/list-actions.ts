"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getClickaduConfigById } from "@/lib/clickadu-roi/config-repository";
import { getClickaduClient } from "@/lib/clickadu-roi/config";
import { getEncryptedTrafficCredential } from "@/lib/traffic-credentials/repository";
import { decryptTrafficSecret } from "@/lib/traffic-credentials/crypto";
import { applyClickaduList, listPrecondition, readClickaduList } from "@/lib/clickadu-roi/list-application";
import { clickaduListCandidates, parseListMethod, type ClickaduListPreview } from "@/lib/clickadu-roi/list-method";
import { buildClickaduRoiAnalysis, publicClickaduAnalysisMessage } from "@/lib/clickadu-roi/analyze";
import { BlacklistReplacementError } from "@/lib/clickadu-roi/blacklist";
import { readCsvUpload } from "@/lib/shopee-import/upload";

async function scoped(accountId: number, configId: unknown) {
  const config = await getClickaduConfigById(prisma, accountId, configId);
  if (!config) throw new BlacklistReplacementError("Konfigurasi Clickadu tidak ditemukan.");
  const credential = await getEncryptedTrafficCredential(prisma, config.shopeeAccountId, "CLICKADU");
  if (!credential) throw new BlacklistReplacementError("Koneksi Clickadu belum dikonfigurasi.");
  return { config, credentialId: credential.id, client: getClickaduClient(decryptTrafficSecret(credential.encryptedSecret)) };
}
function message(error: unknown) { return error instanceof BlacklistReplacementError ? error.message : publicClickaduAnalysisMessage(error); }

export async function getClickaduListAction(accountId: number, configId: number) {
  await requireUser();
  try {
    const { config, client } = await scoped(accountId, configId);
    const actual = readClickaduList(await client.getCampaign(config.campaignId), config.campaignId);
    return { success: true as const, actual, readAt: new Date().toISOString() };
  } catch (error) { return { success: false as const, message: message(error) }; }
}

async function prepare(accountId: number, data: FormData, methodValue: unknown) {
  let method;
  try { method = parseListMethod(methodValue); } catch { throw new BlacklistReplacementError("Metode Clickadu tidak valid."); }
  const { config, client, credentialId } = await scoped(accountId, data.get("configId"));
  const upload = await readCsvUpload(accountId, data);
  const analysis = await buildClickaduRoiAnalysis({ shopeeAccountId: accountId, configId: config.id,
    dateFrom: data.get("dateFrom"), dateTill: data.get("dateTill"), fxRate: data.get("fxRate"), ...upload }, {
    loadConfig: (id, configId) => getClickaduConfigById(prisma, id, configId), getStatistics: (input) => client.getZoneStatistics(input),
  });
  if (analysis.config.campaignId !== config.campaignId || analysis.config.sourceTag !== config.sourceTag) throw new BlacklistReplacementError("Konfigurasi berubah. Analisis ulang sebelum menerapkan.");
  const target = [...new Set(clickaduListCandidates(analysis.analysis, method))];
  if (method === "WHITELIST" && !target.length) throw new BlacklistReplacementError("Whitelist tidak memiliki kandidat aman. Tidak ada perubahan provider.");
  const campaign = await client.getCampaign(config.campaignId), actual = readClickaduList(campaign, config.campaignId);
  const scope = { accountId, configId: config.id, campaignId: config.campaignId, sourceTag: config.sourceTag,
    credentialId, dateFrom: analysis.dateFrom, dateTill: analysis.dateTill, fxRate: analysis.fxRate,
    csv: Buffer.from(upload.bytes).toString("base64") };
  const preview: ClickaduListPreview = { configId: config.id, campaignId: config.campaignId, label: config.label || config.campaignId,
    previousMethod: actual.method, method, previousCount: actual.zoneIds.length, target,
    precondition: listPrecondition(campaign, method, target, scope) };
  return { preview, scope, client };
}

export async function prepareClickaduListAction(accountId: number, data: FormData, method: unknown) {
  await requireUser();
  try { return { success: true as const, preview: (await prepare(accountId, data, method)).preview }; }
  catch (error) { return { success: false as const, message: message(error) }; }
}

export async function applyClickaduListAction(accountId: number, data: FormData, method: unknown, precondition: string) {
  await requireUser();
  try {
    const { preview, scope, client } = await prepare(accountId, data, method);
    const result = await applyClickaduList(preview.campaignId, preview.method, preview.target, precondition, scope, client);
    let lastBlacklistReplacedAt: string | null = null, warning = "";
    if (result.status === "UPDATED" && preview.method === "BLACKLIST") {
      const at = new Date();
      try {
        const saved = await prisma.clickaduCampaignConfig.updateMany({ where: { id: preview.configId, shopeeAccountId: accountId, campaignId: preview.campaignId, sourceTag: scope.sourceTag }, data: { lastBlacklistReplacedAt: at } });
        if (saved.count !== 1) throw new Error("Config moved");
        lastBlacklistReplacedAt = at.toISOString();
      }
      catch { warning = " Daftar terverifikasi, tetapi waktu replace gagal dicatat."; }
    }
    revalidatePath(`/shopee/${accountId}/clickadu-roi`);
    return { success: true as const, ...result, message: result.message + warning, lastBlacklistReplacedAt };
  } catch (error) { return { success: false as const, message: message(error) }; }
}
