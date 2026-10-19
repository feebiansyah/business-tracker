import Decimal from "decimal.js";
import { AdsterraAmbiguousWriteError } from "./client.ts";
import { parseAdsterraConfigId, parseShopeeAccountId } from "./config-input.ts";
import type { AdsterraCustomBid } from "./types.ts";

export class AdsterraCustomBidWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdsterraCustomBidWriteError";
  }
}

type Country = "ID"; // This editor deliberately never changes GLOBAL or other GEO bids.
type WriteClient = {
  getCustomBids(campaignId: string): Promise<AdsterraCustomBid[]>;
  setCustomBids(campaignId: string, bids: readonly AdsterraCustomBid[]): Promise<void>;
  updateCustomBids(campaignId: string, bids: readonly AdsterraCustomBid[]): Promise<void>;
  deleteCustomBids(campaignId: string, bids: readonly Pick<AdsterraCustomBid, "placementId" | "countryCode">[]): Promise<void>;
};
type Dependencies = {
  loadConfig(accountId: number, configId: number): Promise<{ id: number; shopeeAccountId: number; campaignId: string } | null>;
  loadClient(accountId: number): Promise<WriteClient>;
};
export type CustomBidWriteInput = {
  shopeeAccountId: unknown;
  configId: unknown;
  placementId: unknown;
  expectedPrice: unknown;
  operation: "SAVE" | "DELETE";
  price?: unknown;
};

function placementId(value: unknown) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value.trim())) {
    throw new AdsterraCustomBidWriteError("Placement ID tidak valid.");
  }
  const id = Number(value.trim());
  if (!Number.isSafeInteger(id) || id <= 0) throw new AdsterraCustomBidWriteError("Placement ID tidak valid.");
  return String(id);
}

function price(value: unknown, label: string) {
  if (typeof value !== "string" || !/^(?:\d+)(?:\.\d+)?$/.test(value.trim())) {
    throw new AdsterraCustomBidWriteError(`${label} tidak valid. Gunakan angka 0 sampai 200, contohnya 0.015.`);
  }
  const amount = new Decimal(value.trim());
  if (!amount.isFinite() || amount.isNegative() || amount.greaterThan(200)) {
    throw new AdsterraCustomBidWriteError(`${label} harus antara 0 sampai 200.`);
  }
  // API accepts a JSON number; reject precision the conversion would silently change.
  if (!new Decimal(amount.toNumber()).equals(amount)) {
    throw new AdsterraCustomBidWriteError(`${label} terlalu presisi untuk API Adsterra.`);
  }
  return amount.toString();
}

function exactBidsMatch(actual: readonly AdsterraCustomBid[], expected: readonly AdsterraCustomBid[]) {
  if (actual.length !== expected.length) return false;
  const byKey = new Map(expected.map((bid) => [`${bid.placementId}:${bid.countryCode}`, bid.price]));
  if (byKey.size !== expected.length) return false;
  return actual.every((bid) => {
    const expectedPrice = byKey.get(`${bid.placementId}:${bid.countryCode}`);
    return expectedPrice !== undefined && new Decimal(expectedPrice).equals(bid.price);
  });
}

export async function writeAdsterraPlacementCustomBid(input: CustomBidWriteInput, deps: Dependencies) {
  const accountId = parseShopeeAccountId(input.shopeeAccountId);
  const configId = parseAdsterraConfigId(input.configId);
  const id = placementId(input.placementId);
  if (input.operation !== "SAVE" && input.operation !== "DELETE") throw new AdsterraCustomBidWriteError("Aksi Custom Bid tidak valid.");
  const requestedPrice = input.operation === "SAVE" ? price(input.price, "Harga Custom Bid") : null;
  const expectedPrice = input.expectedPrice === null ? null : price(input.expectedPrice, "Harga awal");

  const config = await deps.loadConfig(accountId, configId);
  if (!config || config.id !== configId || config.shopeeAccountId !== accountId) {
    throw new AdsterraCustomBidWriteError("Konfigurasi Adsterra tidak ditemukan.");
  }

  const client = await deps.loadClient(accountId);
  const before = await client.getCustomBids(config.campaignId);
  const countryCode: Country = "ID";
  const current = before.find((bid) => bid.placementId === id && bid.countryCode === countryCode);
  const currentPrice = current?.price ?? null;
  if (currentPrice === null ? expectedPrice !== null : expectedPrice === null || !new Decimal(currentPrice).eq(expectedPrice)) {
    throw new AdsterraCustomBidWriteError("Harga Custom Bid sudah berubah. Muat ulang analisis sebelum menyimpan.");
  }
  const changed = requestedPrice === null
    ? current !== undefined
    : current === undefined || !new Decimal(current.price).eq(requestedPrice);
  if (!changed) return { status: "NO_CHANGE" as const, bids: before };

  const updatedBid: AdsterraCustomBid | null = requestedPrice === null
    ? null
    : { placementId: id, countryCode, price: requestedPrice };
  const expected = [
    ...before.filter((bid) => !(bid.placementId === id && bid.countryCode === countryCode)),
    ...(updatedBid ? [updatedBid] : []),
  ];

  let ambiguous = false;
  try {
    if (!updatedBid) {
      await client.deleteCustomBids(config.campaignId, [{ placementId: id, countryCode }]);
    } else if (current) {
      await client.updateCustomBids(config.campaignId, [updatedBid]);
    } else {
      // POST "set list" may replace all bids. Include EVERY existing GEO/Placement
      // so creating a single ID override cannot intentionally erase other overrides.
      await client.setCustomBids(config.campaignId, expected);
    }
  } catch (error) {
    if (!(error instanceof AdsterraAmbiguousWriteError)) throw error;
    ambiguous = true;
  }

  let actual: AdsterraCustomBid[];
  try {
    actual = await client.getCustomBids(config.campaignId);
  } catch {
    throw new AdsterraCustomBidWriteError("Custom Bid mungkin sudah berubah, tetapi verifikasi API gagal. Periksa di Adsterra sebelum mencoba lagi.");
  }
  if (!exactBidsMatch(actual, expected)) {
    throw new AdsterraCustomBidWriteError(ambiguous
      ? "Status perubahan Custom Bid tidak dapat dipastikan. Daftar aktual tidak cocok; periksa Adsterra sebelum mengulangi."
      : "Verifikasi Custom Bid gagal: daftar akhir berbeda dari yang diharapkan. Periksa Adsterra sebelum mengulangi.");
  }

  return { status: "UPDATED" as const, bids: actual };
}
