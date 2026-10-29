import { OperationError } from "./types";

/** A wait timeout stops THIS continuation, not the underlying database query. */
export class OperationBudget {
  readonly deadline: number;
  private requests = 0;
  private readonly cleanupReserve: number;
  constructor(readonly now: () => number = Date.now, duration = 90_000) {
    this.deadline = now() + duration;
    this.cleanupReserve = Math.min(5000, duration / 10);
  }
  remaining() { return Math.max(0, this.deadline - this.now() - this.cleanupReserve); }
  check(reserve = 0) { if (this.remaining() <= reserve) throw new OperationError("Batas waktu operasi tercapai. Write tidak diulang otomatis; periksa hasil/operasi tertunda."); }
  requireRequests(count: number) { if (this.requests + count > 40) throw new OperationError("Sisa request tidak cukup untuk mutasi dan verifikasi lengkap. Tidak mengirim write."); }
  async wait<T>(promise: Promise<T>): Promise<T> {
    this.check();
    return this.waitWithin(promise, this.remaining());
  }
  /** Receipt-proven no-dispatch CAS only, within the ORIGINAL 90s hard deadline. */
  async settle<T>(promise: Promise<T>): Promise<T> {
    const remaining = Math.min(this.cleanupReserve, this.deadline - this.now());
    if (remaining <= 0) throw new OperationError("Waktu penyelesaian marker habis; hasil DB tetap belum pasti.");
    return this.waitWithin(promise, remaining);
  }
  private async waitWithin<T>(promise: Promise<T>, remaining: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new OperationError("Penantian database/autentikasi melewati batas waktu; query belum tentu dibatalkan.")), remaining); })]); }
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
