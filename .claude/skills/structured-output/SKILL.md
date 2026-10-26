---
name: structured-output
description: Add an LLM call whose result is a typed, schema-validated object. Use whenever a feature needs the model to classify, extract or decide something that other code will consume.
---

# Structured output

Model calls in this repo return data, not prose. Follow this recipe.

1. **Define the contract first** as a Zod schema in the feature module.
   Prefer enums over free strings, bound every number and string length,
   and keep it flat. The schema is the API between the model and the code.
2. **Call `generateStructured`** from `src/structured/generate.ts` with:
   - `instructions`: the task only. Format rules are added automatically
     from the schema.
   - `input`: wrap untrusted text with `quoteUntrusted(source, text)` and
     run `redactPII` on it first.
   - `examples`: one or two valid outputs when the task is ambiguous.
   - a small `maxTokens`; a typed answer rarely needs more than 300.
3. **Handle both branches** of the result. `ok: false` is a normal outcome
   (the repair loop gave up). Log `lastRaw` without personal data and fall
   back to a safe default or a human handoff.
4. **Gate side effects** with `checkAction` and an `ActionPolicy`. The model
   proposes; the policy decides.
5. **Test with `MockProvider`**: one valid response, one invalid JSON that
   gets repaired, one that never validates.

Why: a validated object can be consumed by services, queues and APIs
directly; the repair turn is much shorter than re-running the prompt; and
enums plus length limits shrink both the output and the room for injection.
