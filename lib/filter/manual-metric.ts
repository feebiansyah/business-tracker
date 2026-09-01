export function buildManualMetricUpdate(note: string, completed: boolean) {
  const normalizedNote = note.trim().slice(0, 2000);
  return { note: normalizedNote || null, completed };
}
