/**
 * Provider abstraction. The harness never depends on a specific vendor SDK:
 * every model call goes through this interface, which keeps the rest of the
 * code testable (see MockProvider) and makes swapping models a config change.
 */

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  system: string;
  messages: ChatMessage[];
  /** Upper bound for the response. Structured output keeps this small. */
  maxTokens?: number;
  temperature?: number;
}

export interface CompletionResult {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface LlmProvider {
  readonly name: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

/**
 * Deterministic provider for tests and offline demos. It replays a queue of
 * canned responses, or derives one from the request through a handler.
 */
export class MockProvider implements LlmProvider {
  readonly name = "mock";
  readonly calls: CompletionRequest[] = [];
  private readonly queue: string[];

  constructor(
    responses: string[] = [],
    private readonly handler?: (req: CompletionRequest) => string,
  ) {
    this.queue = [...responses];
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.calls.push(req);
    const next = this.queue.shift();
    const text = next ?? this.handler?.(req);
    if (text === undefined) throw new Error("MockProvider: no response queued");
    return { text, usage: { inputTokens: estimateTokens(req), outputTokens: Math.ceil(text.length / 4) } };
  }
}

/** Thin Anthropic Messages API adapter built on fetch (no SDK dependency). */
export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl = "https://api.anthropic.com",
  ) {}

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        system: req.system,
        messages: req.messages,
        max_tokens: req.maxTokens ?? 1024,
        temperature: req.temperature ?? 0,
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
      usage?: { input_tokens: number; output_tokens: number };
    };
    const text = body.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    return {
      text,
      usage: body.usage && { inputTokens: body.usage.input_tokens, outputTokens: body.usage.output_tokens },
    };
  }
}

/** Picks a real provider when credentials exist, otherwise the mock. */
export function providerFromEnv(fallback: LlmProvider): LlmProvider {
  const key = process.env.ANTHROPIC_API_KEY;
  const model = process.env.HARNESS_MODEL;
  return key && model ? new AnthropicProvider(key, model) : fallback;
}

function estimateTokens(req: CompletionRequest): number {
  const chars = req.system.length + req.messages.reduce((n, m) => n + m.content.length, 0);
  return Math.ceil(chars / 4);
}
