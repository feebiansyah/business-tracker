import { AdsterraAmbiguousWriteError, type AdsterraCampaignStatusResult } from "./client.ts";

type CampaignActivityClient = {
  setCampaignActive(campaignId: string, active: boolean): Promise<void>;
  getCampaignStatus(campaignId: string): Promise<AdsterraCampaignStatusResult>;
};

type VerificationOptions = { sleep?: (milliseconds: number) => Promise<void>; attempts?: number };

export async function setAndVerifyAdsterraCampaignActive(
  campaignId: string,
  desiredActive: boolean,
  client: CampaignActivityClient,
  options: VerificationOptions = {},
) {
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const attempts = options.attempts ?? 3;
  let writeWasAmbiguous = false;
  try {
    await client.setCampaignActive(campaignId, desiredActive);
  } catch (error) {
    if (!(error instanceof AdsterraAmbiguousWriteError)) throw error;
    writeWasAmbiguous = true;
  }

  let actual: AdsterraCampaignStatusResult | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    actual = await client.getCampaignStatus(campaignId);
    const verified = desiredActive ? actual.status === "ACTIVE" : actual.status === "INACTIVE";
    if (verified) return { verified: true as const, actual, writeWasAmbiguous };
    if (attempt < attempts - 1) await sleep(attempt === 0 ? 500 : 1000);
  }
  return { verified: false as const, actual: actual!, writeWasAmbiguous };
}
