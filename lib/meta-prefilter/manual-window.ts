export const manualAwalClosedMessage = "Snapshot Awal tidak dapat diperbarui setelah pukul 18.00 WIB.";
export const readManualWindowServerTime = () => Date.now();

export function manualAwalDeadline(now: Date): number {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta",year: "numeric",month: "2-digit",day: "2-digit" }).format(now);
  return Date.parse(date + "T18:00:00+07:00");
}

export function isManualAwalClosed(now: Date): boolean {
  return now.getTime() >= manualAwalDeadline(now);
}
