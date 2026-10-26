#!/usr/bin/env node
/**
 * PreToolUse hook for Edit/Write. Keeps the agent away from secrets, lockfiles
 * and generated output. Exit code 2 blocks the edit and explains why.
 */
import { readFileSync } from "node:fs";

export const PROTECTED = [
  { pattern: /(^|\/)\.env(\.(?!example$)[^/]*)?$/, reason: "environment files hold secrets; edit .env.example instead" },
  { pattern: /(^|\/)package-lock\.json$/, reason: "lockfiles change only through npm install" },
  { pattern: /(^|\/)dist\//, reason: "dist/ is build output; edit the source in src/" },
  { pattern: /(^|\/)\.git\//, reason: "git internals" },
  { pattern: /\.(pem|key|p12)$/, reason: "key material" },
];

export function check(filePath) {
  const normalized = String(filePath).replaceAll("\\", "/");
  const hit = PROTECTED.find((p) => p.pattern.test(normalized));
  return hit ? { blocked: true, reason: hit.reason } : { blocked: false };
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    process.exit(0);
  }
  const filePath = payload?.tool_input?.file_path ?? "";
  const result = check(filePath);
  if (result.blocked) {
    process.stderr.write(`Blocked by protect-files: ${filePath} (${result.reason}).\n`);
    process.exit(2);
  }
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
