import { describe, expect, it } from "vitest";
import { HttpClient, HttpError, TokenBucket } from "../src/integrations/http-client.js";

type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | Error;

function fakeFetch(replies: Reply[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: URL | string, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    const r = replies.shift();
    if (!r) throw new Error("no reply queued");
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status, headers: r.headers });
  }) as typeof fetch;
  return { impl, calls };
}

function client(replies: Reply[], extra: Partial<ConstructorParameters<typeof HttpClient>[0]> = {}) {
  const f = fakeFetch(replies);
  const sleeps: number[] = [];
  let clock = 0;
  const c = new HttpClient({
    baseUrl: "https://api.example.com",
    fetchImpl: f.impl,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    now: () => clock,
    random: () => 0.5,
    ratePerSecond: 100,
    ...extra,
  });
  return { c, calls: f.calls, sleeps, advance: (ms: number) => (clock += ms) };
}

describe("HttpClient", () => {
  it("retries 5xx and then succeeds", async () => {
    const { c, calls } = client([{ status: 503 }, { status: 200, body: { ok: 1 } }]);
    await expect(c.getJson("/x")).resolves.toEqual({ ok: 1 });
    expect(calls).toHaveLength(2);
  });

  it("honours Retry-After on 429", async () => {
    const { c, sleeps } = client([{ status: 429, headers: { "retry-after": "2" } }, { status: 200, body: {} }]);
    await c.getJson("/x");
    expect(sleeps).toContain(2000);
  });

  it("does not retry a 400", async () => {
    const { c, calls } = client([{ status: 400, body: { error: "bad" } }]);
    await expect(c.getJson("/x")).rejects.toBeInstanceOf(HttpError);
    expect(calls).toHaveLength(1);
  });

  it("retries network errors up to maxRetries, then throws", async () => {
    const { c, calls } = client([new TypeError("fetch failed"), new TypeError("fetch failed"), new TypeError("fetch failed")], {
      maxRetries: 2,
    });
    await expect(c.getJson("/x")).rejects.toThrow("fetch failed");
    expect(calls).toHaveLength(3);
  });

  it("uses exponential backoff with jitter", async () => {
    const { c, sleeps } = client([{ status: 500 }, { status: 500 }, { status: 200, body: {} }], { baseDelayMs: 100 });
    await c.getJson("/x");
    expect(sleeps).toEqual([75, 150]); // 100*2^n/2 + 0.5*(100*2^n/2)
  });

  it("serves repeated reads from cache within the TTL", async () => {
    const { c, calls, advance } = client([{ status: 200, body: { v: 1 } }, { status: 200, body: { v: 2 } }], { cacheTtlMs: 1000 });
    await c.getJson("/x");
    await c.getJson("/x");
    expect(calls).toHaveLength(1);
    advance(1001);
    await expect(c.getJson("/x")).resolves.toEqual({ v: 2 });
  });

  it("sends the idempotency key on writes, unchanged across retries", async () => {
    const { c, calls } = client([{ status: 502 }, { status: 201, body: { id: "1" } }]);
    await c.postJson("/leads", { name: "Ana" }, "lead:ana:create");
    const keys = calls.map((x) => (x.init.headers as Record<string, string>)["idempotency-key"]);
    expect(keys).toEqual(["lead:ana:create", "lead:ana:create"]);
  });
});

describe("TokenBucket", () => {
  it("lets a burst through and then spaces requests", () => {
    let t = 0;
    const b = new TokenBucket(2, 2, () => t);
    expect([b.take(), b.take()]).toEqual([0, 0]);
    expect(b.take()).toBe(500);
    t += 1000;
    expect(b.take()).toBe(0);
  });
});
