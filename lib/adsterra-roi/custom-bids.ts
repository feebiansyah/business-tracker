import { AdsterraApiError } from "./client.ts";
import { parseAdsterraConfigId, parseShopeeAccountId } from "./config-input.ts";
import type { AdsterraCustomBid } from "./types.ts";

type CustomBidClient = { getCustomBids(campaignId: string): Promise<AdsterraCustomBid[]> };
type Dependencies = {
  loadConfig(accountId: number, configId: number): Promise<{ id: number; shopeeAccountId: number; campaignId: string } | null>;
  loadClient(accountId: number): Promise<CustomBidClient>;
};

export async function loadAdsterraCustomBids(accountValue: unknown, configValue: unknown, deps: Dependencies) {
  const accountId = parseShopeeAccountId(accountValue);
  const configId = parseAdsterraConfigId(configValue);
  const config = await deps.loadConfig(accountId, configId);
  if (!config || config.id !== configId || config.shopeeAccountId !== accountId) throw new AdsterraApiError("Konfigurasi Adsterra tidak ditemukan.");
  const client = await deps.loadClient(accountId);
  return client.getCustomBids(config.campaignId);
}

export function placementCustomBids(bids: readonly AdsterraCustomBid[], placement: string) {
  const placementId = /^\d+$/.test(placement) && Number.isSafeInteger(Number(placement)) ? String(Number(placement)) : placement;
  return {
    indonesia: bids.find((bid) => bid.placementId === placementId && bid.countryCode === "ID")?.price ?? null,
    global: bids.find((bid) => bid.placementId === placementId && bid.countryCode === "GLOBAL")?.price ?? null,
  };
}
