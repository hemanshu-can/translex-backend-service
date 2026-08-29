import type { NextFunction, Request, Response } from "express";
import { BadRequestError } from "routing-controllers";

/**
 * Input guard for the /convert endpoint. The body text is handed straight to
 * the LLM, so it is screened for common prompt-injection and abuse patterns
 * before it ever reaches DeepSeek. This is a heuristic filter, not a
 * guarantee — treat it as one layer of defence, not a replacement for it.
 *
 * Rejected requests get a 400 with the specific rule(s) that tripped, so a
 * legitimate document that looks suspicious is easy to debug.
 */

/** Ceiling for /convert input. Override with MAX_CONVERT_TEXT_LENGTH. */
const MAX_TEXT_LENGTH = Number(process.env.MAX_CONVERT_TEXT_LENGTH) || 50_000;

/** \n \r \t are deliberately absent — they're legitimate in prose. */
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
/** Zero-width and bidi-override characters, commonly used to hide injected text. */
const UNICODE_ABUSE_RE = /[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/;

const INJECTION_PATTERNS: ReadonlyArray<{ rule: string; re: RegExp }> = [
  {
    rule: "instruction-override",
    re: /\b(?:ignore|disregard|forget|stop\s+following)\b[\s\S]{0,40}\b(?:instructions?|prompts?|rules|messages?|guidelines?|directions?|system\s+prompt)\b/i,
  },
  {
    rule: "role-hijack",
    re: /\b(?:you\s+are\s+(?:now|no\s+longer)|you\s+will\s+now|from\s+now\s+on\s+you|act\s+as\b|pretend\s+(?:to\s+be|that\s+you\s+are))\b/i,
  },
  {
    rule: "prompt-extraction",
    re: /\b(?:reveal|print|output|show|display|repeat|paste|echo|copy|write\s+out)\b[\s\S]{0,40}\b(?:system\s+prompt|system\s+message|developer\s+message|initial\s+instructions?|hidden\s+instructions?|your\s+(?:instructions?|system\s+prompt))\b/i,
  },
  {
    rule: "prompt-discovery",
    re: /\bwhat\s+(?:are|is)\s+(?:your\s+)?(?:system\s+prompt|system\s+message|instructions?)\b/i,
  },
  {
    rule: "delimiter-injection",
    re: /<\/?(?:system|user|assistant|developer)\s*>|<\|(?:\/)?(?:system|user|assistant)\|>|\[(?:INST|SYS)\]|<<\s*SYS\s*>>|(?:<|\[)\s*(?:END|START)\s+OF\s+(?:INSTRUCTIONS|PROMPT|SYSTEM|MESSAGE)/i,
  },
  {
    rule: "jailbreak",
    re: /\bjailbreak\b|\bdo\s+anything\s+now\b|\buncensored\b|\bno\s+(?:rules|restrictions|limits?|filters?|filtering|censorship)\b/i,
  },
  // DAN is case-sensitive: the jailbreak token is "DAN", not the name "Dan".
  {
    rule: "dan-mode",
    re: /\bDAN\b/,
  },
];

/**
 * Returns a list of reasons the text is unsafe to send to the LLM.
 * An empty array means it passed all checks.
 */
export function findConvertInputIssues(text: string): string[] {
  const issues: string[] = [];
  if (!text) {
    issues.push("text is missing or empty");
    return issues;
  }
  if (text.length > MAX_TEXT_LENGTH) {
    issues.push(
      `text exceeds ${MAX_TEXT_LENGTH.toLocaleString()} characters (got ${text.length.toLocaleString()})`,
    );
  }
  if (CONTROL_CHARS_RE.test(text)) {
    issues.push("text contains control characters (incl. null bytes)");
  }
  if (UNICODE_ABUSE_RE.test(text)) {
    issues.push("text contains zero-width/bidi-override characters");
  }
  // Only meaningful within the size limit — an oversized blob is rejected for
  // its length regardless, and flagging both reasons is just noise.
  if (text.length <= MAX_TEXT_LENGTH && isEncodedPayload(text)) {
    issues.push("text looks like an encoded (base64/hex) payload");
  }
  for (const { rule, re } of INJECTION_PATTERNS) {
    if (re.test(text)) {
      issues.push(`matches prompt-injection pattern: ${rule}`);
    }
  }
  return issues;
}

/** Flags whitespace-free blobs that are pure base64 or hex — a common way to smuggle payloads. */
function isEncodedPayload(text: string): boolean {
  const t = text.trim();
  if (t.length < 100 || /\s/.test(t)) return false;
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(t) && t.length % 4 === 0) return true;
  if (/^[0-9a-fA-F]{64,}$/.test(t)) return true;
  return false;
}

/** Express middleware: rejects the request with a 400 if the body text fails any check. */
export function convertInputGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const body = req.body as Record<string, unknown> | undefined;
  const text = typeof body?.text === "string" ? body.text : "";
  const issues = findConvertInputIssues(text);
  if (issues.length > 0) {
    next(
      new BadRequestError(`Rejected text before LLM call: ${issues.join("; ")}`),
    );
    return;
  }
  next();
}
