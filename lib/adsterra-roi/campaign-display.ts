import "server-only";
import { parseAdsterraCampaignDisplays, type CampaignDisplay } from "../traffic-roi/campaign-display";

type Config = { id: number; shopeeAccountId: number; campaignId: string };
type Dependencies = {
  loadCredential(accountId: number): Promise<{ shopeeAccountId: number; provider: string; encryptedSecret: string } | null>;
  decrypt(secret: string): string;
  fetchImpl?: typeof fetch;
};

// One GET per account page, independent of config count. No retries, per-row
// fallback, operation-state reads, or provider/database writes.
export async function loadAdsterraCampaignDisplays(accountId: number, configs: Config[], deps: Dependencies): Promise<Record<number, CampaignDisplay>> {
  try {
    if (!Number.isSafeInteger(accountId) || accountId <= 0 || !configs.length || configs.some(c => c.shopeeAccountId !== accountId)) return {};
    const credential = await deps.loadCredential(accountId);
    if (!credential || credential.shopeeAccountId !== accountId || credential.provider !== "ADSTERRA") return {};
    const response = await (deps.fetchImpl ?? fetch)("https://api3.adsterratools.com/advertiser/campaigns.json", {
      method: "GET", headers: { "X-API-Key": deps.decrypt(credential.encryptedSecret), Accept: "application/json" },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok || !response.body) return {};
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 2_000_000) { await reader.cancel(); return {}; }
      chunks.push(part.value);
    }
    const rows = parseAdsterraCampaignDisplays(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const result: Record<number, CampaignDisplay> = {};
    for (const config of configs) {
      if (!/^\d+$/.test(config.campaignId) || !Number.isSafeInteger(Number(config.campaignId)) || Number(config.campaignId) <= 0) continue;
      const row = rows[String(Number(config.campaignId))];
      if (row) result[config.id] = row;
    }
    return result;
  } catch { return {}; }
}
