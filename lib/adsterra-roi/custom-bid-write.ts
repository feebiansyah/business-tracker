import Decimal from "decimal.js";
import { AdsterraAmbiguousWriteError } from "./client.ts";
import { parseAdsterraConfigId, parseShopeeAccountId } from "./config-input.ts";
import type { AdsterraCustomBid } from "./types.ts";
import { resetBlacklistedCustomBids } from "./blacklist.ts";

export class AdsterraCustomBidWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdsterraCustomBidWriteError";
  }
}

type Country = "ID"; // Manual edits target ID; blacklist race cleanup resets all blocked GEOs.
type ExperimentTarget = { shopeeAccountId: number; campaignId: string; placementId: string };

// Server-only caller supplies environment + request headers, never browser input.
export function readAdsterraCustomBidExperiment(env: Record<string, string | undefined>, host: string | null, origin: string | null): ExperimentTarget | null {
  if (env.NODE_ENV !== "development" || env.RAILWAY_PROJECT_ID || !host || !origin) return null;
  try {
    const url = new URL(origin);
    if (!["http:", "https:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      || url.host !== host || url.origin !== origin) return null;
  } catch { return null; }
  const ids = env.ADSTERRA_CUSTOM_BID_TEST_TARGET?.split(":");
  if (!ids || ids.length !== 3 || ids.some((value) => !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))) return null;
  return { shopeeAccountId: Number(ids[0]), campaignId: ids[1], placementId: ids[2] };
}

type WriteClient = {
  getBlacklist(campaignId: string): Promise<number[]>;
  getCustomBids(campaignId: string): Promise<AdsterraCustomBid[]>;
  setCustomBids(campaignId: string, bids: readonly AdsterraCustomBid[]): Promise<AdsterraCustomBid[]>;
  updateCustomBids(campaignId: string, bids: readonly AdsterraCustomBid[]): Promise<void>;
  deleteCustomBids(campaignId: string, bids: readonly Pick<AdsterraCustomBid, "placementId" | "countryCode">[]): Promise<void>;
};
type Dependencies = {
  experiment?: ExperimentTarget | null;
  allowCreate?: boolean;
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
  const experiment = deps.experiment;
  if (experiment && (experiment.shopeeAccountId !== accountId || experiment.campaignId !== config.campaignId || experiment.placementId !== id)) {
    throw new AdsterraCustomBidWriteError("Operasi dibatasi pada satu campaign dan Placement target uji yang dikonfigurasi server.");
  }

  const client = await deps.loadClient(accountId);
  const assertSaveAllowed = (blocked: readonly number[]) => {
    if (blocked.includes(Number(id))) {
      throw new AdsterraCustomBidWriteError("Custom Bid tidak dapat disimpan: Placement sedang dalam blacklist.");
    }
  };
  if (input.operation === "SAVE") assertSaveAllowed(await client.getBlacklist(config.campaignId));
  const before = await client.getCustomBids(config.campaignId);
  const countryCode: Country = "ID";
  const current = before.find((bid) => bid.placementId === id && bid.countryCode === countryCode);
  const creating = input.operation === "SAVE" && !current;
  if (creating && !experiment && !deps.allowCreate) {
    throw new AdsterraCustomBidWriteError("Pembuatan override baru belum diaktifkan pada server ini.");
  }
  const currentPrice = current?.price ?? null;
  if (currentPrice === null ? expectedPrice !== null : expectedPrice === null || !new Decimal(currentPrice).eq(expectedPrice)) {
    throw new AdsterraCustomBidWriteError("Harga Custom Bid sudah berubah. Muat ulang analisis sebelum menyimpan.");
  }
  const changed = requestedPrice === null
    ? current !== undefined
    : current === undefined || !new Decimal(current.price).eq(requestedPrice);
  if (!changed) return { status: "NO_CHANGE" as const, bids: before };

  if (input.operation === "SAVE") {
    assertSaveAllowed(await client.getBlacklist(config.campaignId));
  }

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
    } else if (creating) {
      // Create: ONLY the explicit operator input, NEVER a previous campaign snapshot.
      const response = await client.setCustomBids(config.campaignId, [updatedBid]);
      if (!exactBidsMatch(response, expected)) ambiguous = true;
    } else {
      // PATCH is update-only; if removed concurrently, fail rather than fall back to POST.
      await client.updateCustomBids(config.campaignId, [updatedBid]);
    }
  } catch (error) {
    if (!creating && !(error instanceof AdsterraAmbiguousWriteError)) throw error;
    ambiguous = true;
  }

  let actual: AdsterraCustomBid[];
  try {
    actual = await client.getCustomBids(config.campaignId);
  } catch {
    throw new AdsterraCustomBidWriteError("Custom Bid mungkin sudah berubah, tetapi verifikasi API gagal. Periksa di Adsterra sebelum mencoba lagi.");
  }
  if (input.operation === "SAVE") {
    // Provider writes cannot be atomic with a blacklist changed by another operator.
    // Detect a concurrent blacklist change and remove blocked overrides, never restore.
    let blocked: number[];
    try { blocked = await client.getBlacklist(config.campaignId); }
    catch { throw new AdsterraCustomBidWriteError("Custom Bid mungkin sudah berubah, tetapi verifikasi blacklist gagal. Periksa Adsterra sebelum mencoba lagi."); }
    if (actual.some((bid) => blocked.includes(Number(bid.placementId)))) {
      if (experiment && blocked.some((placement) => placement !== Number(id))) {
        throw new AdsterraCustomBidWriteError("Blacklist berubah. Verifikasi gagal; uji ini tidak menjalankan reset otomatis pada Placement lain. Periksa Adsterra sebelum melanjutkan.");
      }
      const reset = await resetBlacklistedCustomBids(config.campaignId, blocked, client);
      throw new AdsterraCustomBidWriteError(reset.status === "COMPLETE"
        ? "Blacklist berubah selama penyimpanan. Custom Bid placement blacklist sudah direset; muat ulang analisis."
        : `${reset.message} Placement belum direset/terverifikasi: ${reset.pendingPlacementIds.join(", ")}.`);
    }
  }
  if (creating && ambiguous) {
    throw new AdsterraCustomBidWriteError("Verifikasi Custom Bid gagal: hasil POST tidak dapat dipastikan. GET sudah diperiksa, tetapi operasi tidak diklaim berhasil. Periksa Adsterra sebelum mencoba lagi; POST tidak diulang otomatis.");
  }
  if (!exactBidsMatch(actual, expected)) {
    throw new AdsterraCustomBidWriteError(ambiguous
      ? "Status perubahan Custom Bid tidak dapat dipastikan. Daftar aktual tidak cocok; periksa Adsterra sebelum mengulangi."
      : "Verifikasi Custom Bid gagal: daftar akhir berbeda dari yang diharapkan. Periksa Adsterra sebelum mengulangi.");
  }

  return { status: "UPDATED" as const, bids: actual };
}
