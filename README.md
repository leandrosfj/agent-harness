# agent-harness

[![CI](https://github.com/leandrosfj/agent-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/leandrosfj/agent-harness/actions/workflows/ci.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)
![MCP](https://img.shields.io/badge/MCP-server-6e56cf)
![License: MIT](https://img.shields.io/badge/license-MIT-green)

*[Leia em português](README.pt-BR.md)*

A production-minded harness for AI coding agents and LLM features.

Getting a model to answer is easy. Getting it to behave inside a real
codebase and a real product is the engineering work: what context it gets,
which actions it may take, how its output is checked, and what happens when
it is wrong. This repository is a working, tested reference for that layer.

## What is inside

| Area | Where | What it shows |
|---|---|---|
| Project rules | [`CLAUDE.md`](CLAUDE.md) | Short, always-loaded instructions; details pushed to skills |
| Hooks | [`.claude/hooks/`](.claude/hooks) | `guard-bash` blocks destructive or secret-leaking commands, `protect-files` keeps the agent out of `.env`, lockfiles and `dist/`, a post-edit hook runs the type checker and feeds errors back |
| Subagents | [`.claude/agents/`](.claude/agents) | Independent `code-reviewer`, `test-writer` and `integration-researcher`, each with its own tools and context |
| Skills | [`.claude/skills/`](.claude/skills) | Step-by-step procedures loaded on demand: structured output, new native integration, review loop |
| Permissions | [`.claude/settings.json`](.claude/settings.json) | Read-only tools pre-approved, shared-state writes always ask, secrets denied |
| MCP server | [`src/mcp/`](src/mcp) | Lead-funnel tools with input/output schemas, `structuredContent`, read-only hints and injection screening |
| Structured output | [`src/structured/`](src/structured) | Zod schema → JSON Schema → validated typed result, with a short repair turn on failure |
| Guardrails | [`src/guardrails/`](src/guardrails) | PII redaction, prompt-injection screening, untrusted-content quoting, action allowlist and approval policy |
| Native integrations | [`src/integrations/`](src/integrations) | HTTP client with token bucket rate limit, retries with backoff and jitter, `Retry-After`, timeouts, TTL cache, idempotency keys |
| Scheduled agent | [`.github/workflows/scheduled-agent.yml`](.github/workflows/scheduled-agent.yml) | The same harness run headless every week, reporting through an issue |

Architecture and the reasoning behind each choice: [`docs/architecture.md`](docs/architecture.md).

## Quick start

```bash
npm install
npm run test        # 57 tests, no network
npm run example     # inbound message -> typed decision, offline with a mock model
npm run mcp:dev     # start the MCP server on stdio
```

With `ANTHROPIC_API_KEY` and `HARNESS_MODEL` set (see `.env.example`), the
example calls the real model through the same code path.

Open the folder in Claude Code and the harness is active: hooks run on every
tool call, the `leads` MCP server is available, and the skills and subagents
are listed.

## Example: untrusted text to a safe action

```ts
const Decision = z.object({
  intent: z.enum(["purchase", "support", "pricing", "cancel", "other"]),
  confidence: z.number().min(0).max(1),
  action: z.enum(["move_to_qualified", "open_ticket", "send_price_table", "handoff_to_human", "none"]),
  reply: z.string().max(280),
});

const { text } = redactPII(message);
const result = await generateStructured({
  provider,
  schema: Decision,
  instructions: "Triage inbound sales messages and pick one next action.",
  input: quoteUntrusted("whatsapp", text),
});

if (result.ok) {
  const verdict = checkAction(policy, result.data.action); // allow | approve | deny
}
```

The result is a typed object or a typed failure, never free text, so a queue
worker or an API handler can consume it directly.

## Design principles

- **Enforce, do not ask.** Rules that matter live in hooks and permissions,
  not only in the prompt.
- **Small base context.** Always-loaded instructions stay short; procedures
  load as skills when needed.
- **Independent review.** The agent that wrote a change does not approve it.
- **Schemas at every boundary.** Model output and external API responses are
  validated where they enter the system.
- **The model proposes, code decides.** Side effects go through a policy.
- **Deterministic tests.** Time, randomness, `fetch` and the model are
  injected; the suite runs offline in about a second.

## Stack

TypeScript (strict, ESM) · Node.js 20+ · Zod 4 · Model Context Protocol SDK ·
Vitest · GitHub Actions.

## Author

Leandro Silva Ferreira Junior · [LinkedIn](https://www.linkedin.com/in/leandrosfj)

Fictitious data only. MIT license.
