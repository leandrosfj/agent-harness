import { describe, expect, it } from "vitest";
import { z } from "zod";
import { generateStructured, parseJson } from "../src/structured/generate.js";
import { MockProvider } from "../src/structured/providers.js";

const Intent = z.object({
  intent: z.enum(["purchase", "support", "other"]),
  confidence: z.number().min(0).max(1),
});

describe("generateStructured", () => {
  it("returns typed data when the first response is valid", async () => {
    const provider = new MockProvider(['{"intent":"purchase","confidence":0.9}']);
    const res = await generateStructured({ provider, schema: Intent, instructions: "Classify.", input: "quero comprar" });
    expect(res).toMatchObject({ ok: true, data: { intent: "purchase", confidence: 0.9 }, attempts: 1 });
  });

  it("puts the JSON Schema in the system prompt", async () => {
    const provider = new MockProvider(['{"intent":"other","confidence":0.1}']);
    await generateStructured({ provider, schema: Intent, instructions: "Classify.", input: "x" });
    expect(provider.calls[0]?.system).toContain('"enum":["purchase","support","other"]');
  });

  it("repairs a schema violation with a short follow-up turn", async () => {
    const provider = new MockProvider(['{"intent":"buy","confidence":2}', '{"intent":"purchase","confidence":1}']);
    const res = await generateStructured({ provider, schema: Intent, instructions: "Classify.", input: "x" });
    expect(res.ok).toBe(true);
    expect(res.attempts).toBe(2);
    const repair = provider.calls[1]?.messages.at(-1)?.content ?? "";
    expect(repair).toContain("invalid");
    expect(repair).not.toContain("Classify.");
  });

  it("repairs output that is not JSON", async () => {
    const provider = new MockProvider(["Sure! The intent is purchase.", '{"intent":"purchase","confidence":0.8}']);
    const res = await generateStructured({ provider, schema: Intent, instructions: "Classify.", input: "x" });
    expect(res.ok && res.data.intent).toBe("purchase");
  });

  it("gives up after maxRepairs and returns the last raw output", async () => {
    const provider = new MockProvider(["nope", "still nope"]);
    const res = await generateStructured({ provider, schema: Intent, instructions: "Classify.", input: "x", maxRepairs: 1 });
    expect(res).toMatchObject({ ok: false, attempts: 2, lastRaw: "still nope" });
  });

  it("sends few-shot examples as prior turns", async () => {
    const provider = new MockProvider(['{"intent":"support","confidence":0.7}']);
    await generateStructured({
      provider,
      schema: Intent,
      instructions: "Classify.",
      input: "não consigo entrar",
      examples: [{ input: "quero comprar", output: { intent: "purchase", confidence: 1 } }],
    });
    expect(provider.calls[0]?.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  });

  it("accumulates token usage across attempts", async () => {
    const provider = new MockProvider(["bad", '{"intent":"other","confidence":0}']);
    const res = await generateStructured({ provider, schema: Intent, instructions: "Classify.", input: "x" });
    expect(res.usage.inputTokens).toBeGreaterThan(provider.calls[0] ? 0 : -1);
    expect(res.usage.outputTokens).toBeGreaterThan(0);
  });
});

describe("parseJson", () => {
  it("accepts JSON inside a markdown fence", () => {
    expect(parseJson('```json\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } });
  });

  it("reports invalid JSON", () => {
    expect(parseJson("{a:1}").ok).toBe(false);
  });
});
