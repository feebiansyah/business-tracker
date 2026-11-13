export const manualPostTypes = ["VIDEO", "GAMBAR_FEWFEED", "GAMBAR_PRODUK"] as const;
export type ManualPostType = typeof manualPostTypes[number];
export const postTypeLabels: Record<ManualPostType, string> = {
  VIDEO: "VIDEO", GAMBAR_FEWFEED: "GAMBAR FEWFEED", GAMBAR_PRODUK: "GAMBAR PRODUK",
};
export type PostTypeInput = { shopeeAccountId: number; metaCampaignId: string; manualType: ManualPostType | null };
export type PostTypeResult = { success: true; manualType: ManualPostType | null } | { success: false; message: string };

export function resolvePostType(manual: ManualPostType | null | undefined, automatic?: string | null): string {
  return manual ? postTypeLabels[manual] : automatic?.trim() || "—";
}

export function parsePostTypeInput(value: unknown): PostTypeInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Jenis postingan tidak valid.");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !["shopeeAccountId", "metaCampaignId", "manualType"].includes(key))
    || !Number.isSafeInteger(input.shopeeAccountId) || (input.shopeeAccountId as number) <= 0
    || typeof input.metaCampaignId !== "string" || !/^[1-9][0-9]{0,99}$/.test(input.metaCampaignId)
    || (input.manualType !== null && !manualPostTypes.includes(input.manualType as ManualPostType))) {
    throw new Error("Jenis postingan tidak valid.");
  }
  return input as PostTypeInput;
}
