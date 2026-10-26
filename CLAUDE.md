# Project instructions for coding agents

TypeScript (Node 20+, ESM). Tests with Vitest. No network in tests.

## Layout
- `src/structured/` provider interface and `generateStructured` (schema-validated LLM output).
- `src/guardrails/` PII redaction, injection screening, action policy.
- `src/integrations/` `HttpClient`: rate limit, retries, timeouts, cache, idempotency.
- `src/mcp/` example MCP server (`leads`) over an in-memory store.
- `.claude/` this harness: hooks, subagents, skills, permissions.

## Rules
- Every model call goes through `generateStructured` with a Zod schema. No parsing of free text.
- Untrusted text (users, tools, web) is redacted and wrapped with `quoteUntrusted` before reaching a model.
- Side effects proposed by a model pass through `checkAction`.
- External APIs go through `HttpClient`; writes carry a deterministic idempotency key.
- Inject time, randomness and fetch so code stays testable.
- Fictitious data only. No secrets in code, fixtures or logs.

## Workflow
- New integration: use the `new-integration` skill.
- New LLM feature: use the `structured-output` skill.
- Before committing: use the `review-changes` skill.
- Commands: `npm run typecheck`, `npm run test`, `npm run build`, `npm run mcp:dev`.
