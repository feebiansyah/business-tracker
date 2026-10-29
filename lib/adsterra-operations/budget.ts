import { OperationError } from "./types";

/** A wait timeout stops THIS continuation, not the underlying database query. */
export class OperationBudget {
  readonly deadline: number;
  private requests = 0;
  constructor(readonly now: () => number = Date.now, duration = 90_000) { this.deadline = now() + duration; }
  remaining() { return Math.max(0, this.deadline - this.now()); }
  check(reserve = 0) { if (this.remaining() <= reserve) throw new OperationError("Batas waktu operasi tercapai. Write tidak diulang otomatis; periksa hasil/operasi tertunda."); }
  async wait<T>(promise: Promise<T>): Promise<T> {
    this.check();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new OperationError("Penantian database/autentikasi melewati batas waktu; query belum tentu dibatalkan.")), this.remaining()); })]); }
    finally { if (timer) clearTimeout(timer); }
  }
  async request(input: string | URL | Request, init: RequestInit, fetcher: typeof fetch = fetch) {
    this.check();
    if (++this.requests > 40) throw new OperationError("Batas 40 request operasi tercapai.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(10_000, this.remaining()));
    try {
      // Consume the body inside the same timeout, never an unbounded response.json.
      const response = await fetcher(input, { ...init, signal: controller.signal, cache: "no-store", redirect: "error" });
      const body = await response.text();
      this.check();
      return new Response(body || null, { status: response.status, headers: response.headers });
    } finally { clearTimeout(timer); }
  }
}
