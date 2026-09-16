import "dotenv/config";

import { pathToFileURL } from "node:url";

import {
  PrismaClient,
  TrafficProvider,
} from "../lib/generated/prisma/client.ts";
import { decryptTrafficSecret } from "../lib/traffic-credentials/crypto-core.ts";

export const ADSTERRA_CAMPAIGN_ID = "1463724";
export const CONFIRMATION = "CONFIRM_OFF_CAMPAIGN_1463724";

const BASE_URL = "https://api3.adsterratools.com/advertiser";
const prisma = new PrismaClient();

export function normalizePlacementIds(values) {
  if (!Array.isArray(values))
    throw new Error("Response blacklist Adsterra tidak valid.");
  return [
    ...new Set(values.map((value) => String(value).trim()).filter(Boolean)),
  ];
}

export function samePlacementSet(left, right) {
  const a = normalizePlacementIds(left).sort();
  const b = normalizePlacementIds(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function buildReplacePayload(placementIds) {
  return {
    campaign_id: Number(ADSTERRA_CAMPAIGN_ID),
    placement_ids: normalizePlacementIds(placementIds).map((id) => Number(id)),
  };
}

export function assertTestGuard(mode, confirmation) {
  if (
    (mode === "test" || mode === "clear-test") &&
    confirmation !== CONFIRMATION
  ) {
    throw new Error(
      `Mode ${mode} memerlukan konfirmasi persis: ${CONFIRMATION}`,
    );
  }
}

async function requestBlacklist(apiKey) {
  const response = await safeFetch(
    `${BASE_URL}/campaign/${ADSTERRA_CAMPAIGN_ID}/linking/blacklist.json`,
    { method: "GET", headers: { "X-API-Key": apiKey } },
  );
  return parseBlacklistResponse(await response.json());
}

async function replaceBlacklist(apiKey, placementIds) {
  const response = await safeFetch(`${BASE_URL}/linking/blacklist.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify(buildReplacePayload(placementIds)),
  });

  const body = await response.json();

  if (placementIds.length === 0) {
    console.log(
      "DEBUG EMPTY PUT RESPONSE:",
      JSON.stringify(body),
    );
  }

  return parseBlacklistResponse(body);
}

async function safeFetch(url, init) {
  let response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error("Koneksi ke Adsterra gagal atau timeout.");
  }
  if (!response.ok) {
    let detail = "";

    try {
      const body = await response.text();
      if (body) detail = ` Response: ${body}`;
    } catch {
      // Abaikan jika response body tidak dapat dibaca.
    }

    throw new Error(
      `Adsterra API gagal dengan HTTP ${response.status}.${detail}`,
    );
  }
  return response;
}

function parseBlacklistResponse(body) {
  if (!body || typeof body !== "object" || !("placement_ids" in body)) {
    throw new Error("Response blacklist Adsterra tidak valid.");
  }
  return normalizePlacementIds(body.placement_ids);
}

async function loadApiKey(shopeeAccountId) {
  let account;
  try {
    account = await prisma.shopeeAccount.findUnique({
      where: { id: shopeeAccountId },
      select: {
        id: true,
        name: true,
        trafficCredentials: {
          where: { provider: TrafficProvider.ADSTERRA },
          select: { encryptedSecret: true },
          take: 1,
        },
      },
    });
  } catch {
    throw new Error("Lookup Shopee Account pada database gagal.");
  }
  if (!account) throw new Error("Shopee Account tidak ditemukan.");
  const credential = account.trafficCredentials[0];
  if (!credential)
    throw new Error(
      "Credential ADSTERRA belum dikonfigurasi untuk Shopee Account ini.",
    );
  try {
    return {
      account,
      apiKey: decryptTrafficSecret(credential.encryptedSecret),
    };
  } catch {
    throw new Error("Credential ADSTERRA tidak dapat didekripsi.");
  }
}

async function inspect(apiKey, account) {
  const placements = await requestBlacklist(apiKey);
  console.log(`Shopee Account: ${account.name} (${account.id})`);
  console.log(`Campaign ID: ${ADSTERRA_CAMPAIGN_ID}`);
  console.log(`Jumlah blacklist: ${placements.length}`);
  console.log(
    `Placement IDs: ${placements.length ? placements.join(", ") : "(kosong)"}`,
  );
}

async function runTest(apiKey, account) {
  const original = await requestBlacklist(apiKey);
  if (original.length < 2)
    throw new Error(
      "Blacklist awal harus memiliki minimal 2 placement untuk safe probe.",
    );
  const testPlacements = original.slice(0, Math.min(3, original.length));
  let testPassed = false;
  let restorePassed = false;

  console.log(`Shopee Account: ${account.name} (${account.id})`);
  console.log(`Campaign ID: ${ADSTERRA_CAMPAIGN_ID}`);
  console.log(`Snapshot awal: ${original.length} placement`);
  console.log(`Placement test: ${testPlacements.join(", ")}`);

  try {
    await replaceBlacklist(apiKey, testPlacements);
    const after = await requestBlacklist(apiKey);
    if (!samePlacementSet(after, testPlacements))
      throw new Error("Verifikasi blacklist test tidak cocok.");
    testPassed = true;
    console.log("TEST PASS: blacklist sama persis dengan placement test.");
  } catch (error) {
    console.error("TEST FAIL: write atau verifikasi blacklist test gagal.");
    throw error;
  } finally {
    try {
      await replaceBlacklist(apiKey, original);
      const restored = await requestBlacklist(apiKey);
      restorePassed = samePlacementSet(restored, original);
      console.log(
        restorePassed
          ? "RESTORE PASS: blacklist awal berhasil dipulihkan persis."
          : "RESTORE FAIL: hasil verifikasi tidak sama dengan snapshot awal.",
      );
    } catch {
      console.error("RESTORE FAIL: pemulihan atau verifikasi blacklist gagal.");
    }
  }

  if (!testPassed || !restorePassed)
    throw new Error("Safe write probe Adsterra tidak selesai dengan aman.");
}

async function runClearTest(apiKey, account) {
  const original = await requestBlacklist(apiKey);

  if (original.length === 0) {
    throw new Error(
      "Blacklist awal kosong. Clear-test dibatalkan karena tidak ada snapshot untuk dipulihkan.",
    );
  }

  let clearPassed = false;
  let restorePassed = false;

  console.log(`Shopee Account: ${account.name} (${account.id})`);
  console.log(`Campaign ID: ${ADSTERRA_CAMPAIGN_ID}`);
  console.log(`Snapshot awal: ${original.length} placement`);
  console.log("CLEAR TEST: mencoba replace blacklist menjadi 0 placement.");

  try {
    await replaceBlacklist(apiKey, []);

    const after = await requestBlacklist(apiKey);

    if (after.length !== 0) {
      throw new Error(
        `Verifikasi clear gagal. Blacklist masih berisi ${after.length} placement.`,
      );
    }

    clearPassed = true;
    console.log("CLEAR PASS: blacklist berhasil menjadi 0 placement.");
  } catch (error) {
    console.error("CLEAR FAIL: write atau verifikasi blacklist kosong gagal.");
    throw error;
  } finally {
    try {
      await replaceBlacklist(apiKey, original);

      const restored = await requestBlacklist(apiKey);
      restorePassed = samePlacementSet(restored, original);

      console.log(
        restorePassed
          ? `RESTORE PASS: ${original.length} placement berhasil dipulihkan persis.`
          : "RESTORE FAIL: hasil restore tidak sama dengan snapshot awal.",
      );
    } catch {
      console.error(
        "RESTORE FAIL: pemulihan blacklist setelah clear-test gagal.",
      );
    }
  }

  if (!clearPassed || !restorePassed) {
    throw new Error(
      "Clear safe-write probe Adsterra tidak selesai dengan aman.",
    );
  }
}
async function main() {
  const [mode, accountIdValue, confirmation] = process.argv.slice(2);
  if (!new Set(["inspect", "test", "clear-test"]).has(mode))
    throw new Error("Mode harus inspect atau test.");
  const shopeeAccountId = Number(accountIdValue);
  if (!Number.isSafeInteger(shopeeAccountId) || shopeeAccountId <= 0)
    throw new Error("Shopee Account ID tidak valid.");
  assertTestGuard(mode, confirmation);

  const { account, apiKey } = await loadApiKey(shopeeAccountId);
  if (mode === "inspect") {
    await inspect(apiKey, account);
  } else if (mode === "test") {
    await runTest(apiKey, account);
  } else {
    await runClearTest(apiKey, account);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main()
    .catch((error) => {
      console.error(
        error instanceof Error
          ? error.message
          : "Safe write probe Adsterra gagal.",
      );
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
