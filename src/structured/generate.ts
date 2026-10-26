import { z } from "zod";
import type { ChatMessage, LlmProvider } from "./providers.js";

/**
 * Structured output as an API contract.
 *
 * The model is asked for JSON that matches a Zod schema. The response is
 * parsed and validated; if it fails, the validation errors are sent back in a
 * short repair turn instead of re-running the whole prompt. Callers receive a
 * typed object or a typed failure, never free text, so downstream services can
 * treat the model like any other API.
 */

export interface StructuredOptions<T extends z.ZodType> {
  provider: LlmProvider;
  schema: T;
  /** What the model should do. Keep it about the task, not the format. */
  instructions: string;
  input: string;
  /** Few-shot examples, already shaped as valid outputs. */
  examples?: Array<{ input: string; output: z.infer<T> }>;
  maxRepairs?: number;
  maxTokens?: number;
}

export type StructuredResult<T> =
  | { ok: true; data: T; attempts: number; usage: Usage }
  | { ok: false; error: string; attempts: number; usage: Usage; lastRaw: string };

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export async function generateStructured<T extends z.ZodType>(
  opts: StructuredOptions<T>,
): Promise<StructuredResult<z.infer<T>>> {
  const maxRepairs = opts.maxRepairs ?? 2;
  const jsonSchema = JSON.stringify(z.toJSONSchema(opts.schema));
  const system = [
    opts.instructions.trim(),
    "",
    "Respond with a single JSON value that validates against this JSON Schema.",
    "No prose, no markdown fences, no extra keys.",
    jsonSchema,
  ].join("\n");

  const messages: ChatMessage[] = [];
  for (const ex of opts.examples ?? []) {
    messages.push({ role: "user", content: ex.input });
    messages.push({ role: "assistant", content: JSON.stringify(ex.output) });
  }
  messages.push({ role: "user", content: opts.input });

  const usage: Usage = { inputTokens: 0, outputTokens: 0 };
  let lastRaw = "";
  let lastError = "";

  for (let attempt = 1; attempt <= maxRepairs + 1; attempt++) {
    const res = await opts.provider.complete({ system, messages, maxTokens: opts.maxTokens ?? 512, temperature: 0 });
    usage.inputTokens += res.usage?.inputTokens ?? 0;
    usage.outputTokens += res.usage?.outputTokens ?? 0;
    lastRaw = res.text;

    const parsed = parseJson(res.text);
    if (parsed.ok) {
      const checked = opts.schema.safeParse(parsed.value);
      if (checked.success) return { ok: true, data: checked.data, attempts: attempt, usage };
      lastError = z.prettifyError(checked.error);
    } else {
      lastError = parsed.error;
    }

    // Repair turn: only the errors, not the whole task again.
    messages.push({ role: "assistant", content: res.text });
    messages.push({
      role: "user",
      content: `The previous output is invalid:\n${lastError}\nReturn only the corrected JSON.`,
    });
  }

  return { ok: false, error: lastError, attempts: maxRepairs + 1, usage, lastRaw };
}

/** Accepts bare JSON or JSON wrapped in a markdown fence. */
export function parseJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const candidate = fenced?.[1] ?? trimmed;
  try {
    return { ok: true, value: JSON.parse(candidate) };
  } catch (err) {
    return { ok: false, error: `Not valid JSON: ${(err as Error).message}` };
  }
}
