export function createMetaSettingsRequestGate() {
  let generation = 0;
  let busy = false;
  return {
    begin() {
      if (busy) return null;
      busy = true;
      return ++generation;
    },
    isCurrent(request: number) { return busy && request === generation; },
    finish(request: number) { if (request === generation) busy = false; },
    invalidate() { generation++; busy = false; },
  };
}
