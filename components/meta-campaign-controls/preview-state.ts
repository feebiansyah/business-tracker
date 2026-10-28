import type { PreviewInput, PreviewResult } from "@/lib/meta-campaign-controls/types";

type Snapshot = { loading: boolean; result: PreviewResult | null };

/** Ephemeral modal state. Queue a new selection behind an in-flight read; never merge snapshots. */
export function createPreviewStore(load: (input: PreviewInput) => Promise<PreviewResult>) {
  let snapshot: Snapshot = { loading: true, result: null };
  let target: PreviewInput | null = null;
  let version = 0;
  let busy = false;
  let queued = false;
  const listeners = new Set<() => void>();
  const publish = (value: Snapshot) => { snapshot = value; listeners.forEach((listener) => listener()); };
  async function run() {
    if (busy || !target || !queued) return;
    busy = true;
    try {
      while (target && queued) {
        queued = false;
        const requestVersion = version;
        const input = target;
        let result: PreviewResult;
        try { result = await load(input); }
        catch { result = { success: false, message: "Preview gagal dimuat. Coba Refresh atau login kembali bila session berakhir." }; }
        if (requestVersion === version && target) publish({ loading: false, result });
      }
    } finally { busy = false; }
  }
  const schedule = () => { queueMicrotask(() => { void run(); }); };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    select(input: PreviewInput) {
      target = input; version++; queued = true;
      publish({ loading: true, result: null }); schedule();
    },
    refresh() {
      if (busy || !target || queued) return;
      version++; queued = true;
      publish({ loading: true, result: null }); schedule();
    },
    cancel() { target = null; version++; queued = false; },
  };
}
