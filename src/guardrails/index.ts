/**
 * Guardrails applied around every model call.
 *
 * Input side: personal data is redacted before it reaches the model, and text
 * coming from tools or users is screened for prompt-injection patterns.
 * Output side: the model may only request actions from an allowlist, and
 * every action is checked against a policy before it runs.
 */

export interface Redaction {
  text: string;
  found: Record<string, number>;
}

const PII_PATTERNS: Array<[label: string, pattern: RegExp]> = [
  ["email", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
  ["cpf", /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g],
  ["card", /\b(?:\d[ -]?){13,16}\b/g],
  ["phone", /(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g],
];

export function redactPII(input: string): Redaction {
  const found: Record<string, number> = {};
  let text = input;
  for (const [label, pattern] of PII_PATTERNS) {
    text = text.replace(pattern, () => {
      found[label] = (found[label] ?? 0) + 1;
      return `[${label.toUpperCase()}]`;
    });
  }
  return { text, found };
}

const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all |any )?(previous|prior|above) (instructions|messages)/i,
  /disregard (the )?(system|previous) (prompt|instructions)/i,
  /you are now (in )?(developer|dan|jailbreak) mode/i,
  /reveal (your|the) (system prompt|instructions|api key)/i,
  /<\s*\/?\s*(system|assistant)\s*>/i,
];

export interface InjectionScan {
  suspicious: boolean;
  matches: string[];
}

/** Heuristic screen for untrusted text (tool results, user messages, web pages). */
export function scanForInjection(text: string): InjectionScan {
  const matches = INJECTION_PATTERNS.filter((p) => p.test(text)).map((p) => p.source);
  return { suspicious: matches.length > 0, matches };
}

/** Wraps untrusted content so the model treats it as data, not instructions. */
export function quoteUntrusted(source: string, text: string): string {
  const safe = text.replaceAll("</untrusted>", "<\\/untrusted>");
  return `<untrusted source="${source}">\n${safe}\n</untrusted>`;
}

export interface ActionPolicy<A extends string> {
  allowed: readonly A[];
  /** Actions that need a human before they run. */
  requiresApproval?: readonly A[];
  maxPerRun?: number;
}

export type PolicyDecision = { decision: "allow" } | { decision: "approve" } | { decision: "deny"; reason: string };

export function checkAction<A extends string>(
  policy: ActionPolicy<A>,
  action: string,
  alreadyExecuted = 0,
): PolicyDecision {
  if (!(policy.allowed as readonly string[]).includes(action)) {
    return { decision: "deny", reason: `action "${action}" is not in the allowlist` };
  }
  if (policy.maxPerRun !== undefined && alreadyExecuted >= policy.maxPerRun) {
    return { decision: "deny", reason: `limit of ${policy.maxPerRun} actions per run reached` };
  }
  if ((policy.requiresApproval as readonly string[] | undefined)?.includes(action)) {
    return { decision: "approve" };
  }
  return { decision: "allow" };
}
