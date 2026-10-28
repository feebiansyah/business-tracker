import "server-only";

import { performance } from "node:perf_hooks";
import { MetaReadError } from "./parse";

/** One deadline from action entry. Read-only waits can expire; mutation pipelines must be awaited. */
export class MetaActionBudget {
  readonly startedAt = Date.now();
  private readonly deadline = performance.now() + 60_000;
  private readonly controller = new AbortController();
  private readonly timer = setTimeout(() => this.controller.abort(), 60_000);
  requests = 0;
  private inFlight = 0;

  remaining() {
    const remaining = this.deadline - performance.now();
    if (this.controller.signal.aborted || remaining <= 0) throw new MetaReadError("LIMIT", "Budget tindakan 60 detik habis.");
    return remaining;
  }

  async waitReadOnly<T>(operation: () => Promise<T>): Promise<T> {
    this.remaining();
    const expired = Symbol("expired");
    let onAbort: () => void = () => {};
    const timeout = new Promise<typeof expired>((resolve) => { onAbort = () => resolve(expired); this.controller.signal.addEventListener("abort", onAbort, { once: true }); });
    try {
      const value = await Promise.race([timeout, operation()]);
      if (value === expired) throw new MetaReadError("LIMIT", "Budget tindakan 60 detik habis; penantian DB dihentikan, bukan pembatalan query.");
      this.remaining();
      return value;
    } finally { this.controller.signal.removeEventListener("abort", onAbort); }
  }

  wrap(fetchImpl: typeof fetch): typeof fetch {
    return async (input, init) => {
      const remaining = this.remaining();
      if (this.requests >= 100) throw new MetaReadError("LIMIT", "Batas 100 request Meta tercapai.");
      if (this.inFlight >= 2) throw new MetaReadError("LIMIT", "Batas dua request Meta bersamaan tercapai.");
      this.requests++; this.inFlight++;
      const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(Math.max(1, Math.min(10_000, Math.floor(remaining)))), ...(init?.signal ? [init.signal] : [])]);
      try { return await fetchImpl(input, { ...init, signal }); }
      finally { this.inFlight--; }
    };
  }

  close() { clearTimeout(this.timer); }
}
