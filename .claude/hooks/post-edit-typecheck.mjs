#!/usr/bin/env node
/**
 * PostToolUse hook for Edit/Write on TypeScript files. Runs the type checker
 * right after the change so the agent sees errors in the same turn, instead
 * of discovering them at the end. Exit code 2 feeds the errors back.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

const filePath = payload?.tool_input?.file_path ?? "";
if (!/\.(ts|tsx|mts)$/.test(filePath)) process.exit(0);

try {
  execFileSync("npx", ["tsc", "--noEmit", "--pretty", "false"], {
    cwd: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
    stdio: "pipe",
    timeout: 60_000,
  });
} catch (err) {
  const out = `${err.stdout ?? ""}${err.stderr ?? ""}`.split("\n").slice(0, 30).join("\n");
  process.stderr.write(`Type check failed after editing ${filePath}:\n${out}\n`);
  process.exit(2);
}
