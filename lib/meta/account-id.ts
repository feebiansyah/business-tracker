export function normalizeMetaAccountPath(accountId: string) {
  const normalized = accountId.trim().replace(/^act_/, "");
  if (!normalized) throw new Error("Meta Account ID tidak valid.");
  return `act_${normalized}`;
}
