import { OperationError } from "./types";

export class ProviderResponseReadError extends OperationError {
  constructor(readonly httpStatus: number, message = "Pembacaan respons API gagal/timeout; hasil belum dapat diverifikasi.") { super(message); }
}
export class ProviderBodyLimitError extends ProviderResponseReadError {
  constructor(httpStatus: number) { super(httpStatus, "Ukuran respons API melewati batas; hasil belum dapat diverifikasi."); }
}

async function boundedBody(response: Response, signal: AbortSignal) {
  if (!response.body) return "";
  const limit = response.ok ? 8 * 1024 * 1024 : 16 * 1024;
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let size = 0, body = "", aborted: (() => void) | undefined;
  const abort = new Promise<never>((_, reject) => {
    aborted = () => reject(new OperationError("Pembacaan respons API melewati batas waktu."));
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) aborted();
  });
  try {
    for (;;) {
      const { value, done } = await Promise.race([reader.read(), abort]);
      if (done) return body + decoder.decode();
      size += value.byteLength;
      if (size > limit) throw new ProviderBodyLimitError(response.status);
      body += decoder.decode(value, { stream: true });
    }
  } catch (error) {
    throw error instanceof ProviderResponseReadError ? error : new ProviderResponseReadError(response.status);
  } finally {
    if (aborted) signal.removeEventListener("abort", aborted);
    // Cancellation is best effort; never wait beyond the original request budget.
    void reader.cancel().catch(() => {});
  }
}

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
      const body = await boundedBody(response, controller.signal);
      this.check();
      return new Response(body || null, { status: response.status, headers: response.headers });
    } finally { clearTimeout(timer); }
  }
}
