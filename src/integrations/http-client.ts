/**
 * Native integration client.
 *
 * What a low-code connector hides, made explicit: per-host rate limiting
 * (token bucket), timeouts, retries with exponential backoff and jitter only
 * for retryable failures, Retry-After support, idempotency keys on writes and
 * a TTL cache for reads. Every external API in the harness goes through this.
 */

export interface HttpClientOptions {
  baseUrl: string;
  /** Requests per second allowed toward this host. */
  ratePerSecond?: number;
  burst?: number;
  timeoutMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  cacheTtlMs?: number;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly retryable: boolean,
  ) {
    super(`HTTP ${status}`);
  }
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly ratePerSecond: number,
    private readonly capacity: number,
    private readonly now: () => number,
  ) {
    this.tokens = capacity;
    this.last = now();
  }

  /** Milliseconds to wait before a token is available (0 if one is free now). */
  take(): number {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((t - this.last) / 1000) * this.ratePerSecond);
    this.last = t;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0;
    }
    const wait = ((1 - this.tokens) / this.ratePerSecond) * 1000;
    this.tokens -= 1;
    return Math.ceil(wait);
  }
}

export class HttpClient {
  private readonly bucket: TokenBucket;
  private readonly cache = new Map<string, { expires: number; value: unknown }>();
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(private readonly opts: HttpClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? Date.now;
    this.random = opts.random ?? Math.random;
    this.bucket = new TokenBucket(opts.ratePerSecond ?? 5, opts.burst ?? opts.ratePerSecond ?? 5, this.now);
  }

  async getJson<T>(path: string, { cache = true }: { cache?: boolean } = {}): Promise<T> {
    const key = `GET ${path}`;
    const hit = this.cache.get(key);
    if (cache && hit && hit.expires > this.now()) return hit.value as T;
    const value = await this.request<T>("GET", path);
    if (cache && this.opts.cacheTtlMs) this.cache.set(key, { expires: this.now() + this.opts.cacheTtlMs, value });
    return value;
  }

  /** Writes carry an idempotency key so a retried request is not applied twice. */
  async postJson<T>(path: string, body: unknown, idempotencyKey: string): Promise<T> {
    return this.request<T>("POST", path, body, { "idempotency-key": idempotencyKey });
  }

  private async request<T>(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<T> {
    const maxRetries = this.opts.maxRetries ?? 3;
    for (let attempt = 0; ; attempt++) {
      const wait = this.bucket.take();
      if (wait > 0) await this.sleep(wait);

      try {
        return await this.once<T>(method, path, body, extra);
      } catch (err) {
        const retryable = err instanceof HttpError ? err.retryable : isNetworkError(err);
        if (!retryable || attempt >= maxRetries) throw err;
        await this.sleep(this.backoff(attempt, err));
      }
    }
  }

  private async once<T>(method: string, path: string, body: unknown, extra: Record<string, string>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 10_000);
    try {
      const res = await this.fetchImpl(new URL(path, this.opts.baseUrl), {
        method,
        signal: controller.signal,
        headers: { accept: "application/json", "content-type": "application/json", ...this.opts.headers, ...extra },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) {
        const err = new HttpError(res.status, await res.text(), RETRYABLE_STATUS.has(res.status));
        (err as HttpError & { retryAfter?: string | null }).retryAfter = res.headers.get("retry-after");
        throw err;
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private backoff(attempt: number, err: unknown): number {
    const retryAfter = (err as { retryAfter?: string | null }).retryAfter;
    if (retryAfter && /^\d+$/.test(retryAfter)) return Number(retryAfter) * 1000;
    const base = (this.opts.baseDelayMs ?? 200) * 2 ** attempt;
    return Math.round(base / 2 + this.random() * (base / 2)); // "equal jitter"
  }
}

function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof Error && err.name === "AbortError");
}
