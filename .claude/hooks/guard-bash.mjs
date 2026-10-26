#!/usr/bin/env node
/**
 * PreToolUse hook for the Bash tool.
 *
 * Reads the hook payload from stdin and blocks commands that are destructive,
 * leak secrets or bypass review. Exit code 2 blocks the call and sends stderr
 * back to the agent, so it can choose a safer command instead of failing.
 */
import { readFileSync } from "node:fs";

export const RULES = [
  { id: "rm-root", pattern: /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)[a-z]*\s+(\/|~|\$HOME|\*)(\s|$)/i, reason: "recursive delete of a root, home or wildcard path" },
  { id: "force-push", pattern: /\bgit\s+push\b[^|;&]*(--force(?!-with-lease)|\s-f\b)/i, reason: "force push rewrites shared history; use --force-with-lease on your own branch" },
  { id: "push-main", pattern: /\bgit\s+push\b[^|;&]*\b(origin\s+)?(main|master)\b/i, reason: "direct push to main; open a pull request" },
  { id: "no-verify", pattern: /\bgit\s+(commit|push)\b[^|;&]*--no-verify/i, reason: "skipping git hooks bypasses the checks this harness relies on" },
  { id: "reset-hard", pattern: /\bgit\s+reset\s+--hard\b/i, reason: "discards uncommitted work" },
  { id: "curl-pipe-sh", pattern: /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z)?sh\b/i, reason: "piping a remote script into a shell" },
  { id: "env-exfil", pattern: /\b(cat|less|more|head|tail|printenv|env)\b[^|;&]*(\.env\b|id_rsa|\.pem\b|credentials)/i, reason: "reading secret files into the transcript" },
  { id: "chmod-777", pattern: /\bchmod\s+(-R\s+)?777\b/, reason: "world-writable permissions" },
  { id: "drop-db", pattern: /\b(drop\s+(database|schema)|truncate\s+table)\b/i, reason: "destructive database statement; run migrations instead" },
];

export function evaluate(command) {
  for (const rule of RULES) {
    if (rule.pattern.test(command)) return { blocked: true, rule: rule.id, reason: rule.reason };
  }
  return { blocked: false };
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    process.exit(0); // malformed payload: do not get in the way
  }
  const command = payload?.tool_input?.command ?? "";
  const result = evaluate(command);
  if (result.blocked) {
    process.stderr.write(`Blocked by guard-bash (${result.rule}): ${result.reason}.\nCommand: ${command}\n`);
    process.exit(2);
  }
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
