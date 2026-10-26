---
name: new-integration
description: Build a native integration with an external REST API (client, retries, rate limit, cache, webhooks, tests). Use when connecting a new third-party service instead of reaching for a low-code connector.
---

# New native integration

1. Delegate research to the `integration-researcher` subagent and wait for
   `docs/integrations/<api>.md`. Do not guess limits.
2. Create `src/integrations/<api>.ts` exposing a small typed client built on
   `HttpClient`, configured from the brief (rate, burst, timeout, retries,
   cache TTL). One method per use case, not a generic passthrough.
3. Validate every response with a Zod schema at the boundary. External APIs
   change; fail loudly at the edge rather than deep inside the app.
4. Writes: always pass an idempotency key derived from the business event
   (for example `lead:<id>:stage:<stage>`), never a random value per retry.
5. Webhooks, if any: verify the signature before parsing, respond 2xx fast,
   and push the payload to a queue for processing.
6. Tests with an injected `fetchImpl`: success, 429 with `Retry-After`,
   500 then success, non-retryable 400, timeout, invalid payload.
7. Ask the `code-reviewer` subagent to review before committing.
