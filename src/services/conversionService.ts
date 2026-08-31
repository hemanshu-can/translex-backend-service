import { getClient, type Page } from "../lib/deepseek.js";

export interface ProofCheckResult {
  /** True when every extracted anchor line lines up with a translated anchor. */
  matched: boolean;
  /** How sure the verifier is of `matched`, as a score from 0 to 100. */
  confidence: number;
  /** Human-readable notes about which anchors (if any) looked wrong. */
  notes: string[];
}

const PROOF_CHECK_SYSTEM_PROMPT =
  'You are a document-verification assistant. You receive two parallel arrays: ' +
  '"extracted" holds the first and last lines of each page of a Hindi source ' +
  'document, and "converted" holds the corresponding first and last lines of its ' +
  'English translation. Each index in the two arrays refers to the same position ' +
  'in the document, and the arrays may differ in length — treat surplus anchors ' +
  "on either side as mismatches.\n" +
  'Decide whether the "converted" anchors match the "extracted" anchors in ' +
  "meaning — i.e. whether every piece of source content appears to be mapped into " +
  "the translation. This is a rough sanity check, not exact-match verification: " +
  "allow paraphrasing and normal translation differences, and flag only real " +
  "omissions or mismatches.\n" +
  'Respond with JSON only: {"matched": boolean, "confidence": number, "notes": [string]}. ' +
  '"matched" is true when all anchors line up, false when any anchor is missing ' +
  'or mismatched; "confidence" is an integer from 0 to 100 expressing how sure ' +
  'you are of "matched"; "notes" lists the anchor index and what looked wrong ' +
  "for each mismatch. Do not add anything outside the JSON.";

/**
 * Proof-checks a conversion. Given the extracted (source) pages and the
 * converted (translated) pages, it pulls the first and last non-empty line of
 * each page as anchor lines, then asks the LLM whether the two anchor arrays
 * match in meaning. Gives a rough signal that all content was mapped.
 */
export async function proofCheck(
  extractedPages: Page[],
  convertedPages: Page[],
): Promise<ProofCheckResult> {
  const extractedAnchors = extractAnchorLines(extractedPages);
  const convertedAnchors = extractAnchorLines(convertedPages);

  // No anchors on either side — a comparison call would be wasted.
  if (extractedAnchors.length === 0 || convertedAnchors.length === 0) {
    return {
      matched: false,
      confidence: 0,
      notes: [
        "One side has no extractable anchor lines, so the check could not be performed.",
      ],
    };
  }

  const completion = await getClient().chat.completions.create({
    model: "deepseek-chat",
    // DeepSeek JSON mode; the word "json" appears in the system prompt.
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: PROOF_CHECK_SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          extracted: extractedAnchors,
          converted: convertedAnchors,
        }),
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? "";
  return parseVerdict(raw);
}

/** First and last anchor line of every page, in page order. */
function extractAnchorLines(pages: Page[]): string[] {
  const anchors: string[] = [];
  for (const page of pages) {
    // A line anchors only if it has at least one letter or digit. Lines that
    // are empty or punctuation-only (`*`, `|`, `---`, `•`, …) are OCR/format
    // separators, not content — never anchors.
    const lines = page.text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /\p{L}|\p{N}/u.test(line));
    if (lines.length === 0) continue;
    anchors.push(lines[0]);
    if (lines.length > 1) anchors.push(lines[lines.length - 1]);
  }
  return anchors;
}

function parseVerdict(raw: string): ProofCheckResult {
  // Strip anything around the JSON object (DeepSeek sometimes adds prose).
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        matched?: unknown;
        confidence?: unknown;
        notes?: unknown;
      };
      if (typeof parsed.matched === "boolean") {
        return {
          matched: parsed.matched,
          confidence: toConfidence(parsed.confidence),
          notes: Array.isArray(parsed.notes)
            ? parsed.notes.filter((n): n is string => typeof n === "string")
            : [],
        };
      }
    } catch {
      // Malformed JSON — fall through to the failed verdict.
    }
  }
  return {
    matched: false,
    confidence: 0,
    notes: [
      "The verification response could not be parsed; treat the check as failed.",
    ],
  };
}

/** Coerces the LLM's confidence to a 0-100 integer; 0 when absent or invalid. */
function toConfidence(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(100, Math.max(0, Math.round(num)));
}
