import OpenAI from "openai";

const apiKey = process.env.DEEPSEEK_API_KEY;

/** One page of a document: its 1-based page number and the text on it. */
export interface Page {
  pageNumber: number;
  text: string;
}

// DeepSeek exposes an OpenAI-compatible API, so the `openai` SDK works as-is.
let client: OpenAI | null = null;
export function getClient(): OpenAI {
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not set in the environment");
  }
  client ??= new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" });
  return client;
}

const SYSTEM_PROMPT =
  "You are a professional translator. Translate the provided Hindi text into " +
  "English. Preserve the original structure, paragraph breaks, and meaning. " +
  'The user sends a JSON object: {"pages": [{"pageNumber": number, "text": string}]}. ' +
  'Translate every page and reply with JSON only, in exactly this shape: ' +
  '{"pages": [{"pageNumber": number, "text": string}]} — reuse the input ' +
  "pageNumber values and put each page's English translation in text. " +
  "Do not add anything outside the JSON.";

export async function convertText(pages: Page[]): Promise<Page[]> {
  const startedAt = Date.now();
  const totalChars = pages.reduce((sum, page) => sum + page.text.length, 0);
  try {
    const completion = await getClient().chat.completions.create({
      model: "deepseek-chat",
      // DeepSeek supports OpenAI-style JSON mode; the word "json" must appear
      // in the messages (it does, in SYSTEM_PROMPT).
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify({ pages }) },
      ],
    });
    const converted = completion.choices[0]?.message?.content ?? "";
    const result = parsePagesResponse(converted);
    console.log(
      `Conversion done: pages=${pages.length} chars=${totalChars} elapsedMs=${Date.now() - startedAt}`,
    );
    return result;
  } catch (error) {
    console.error(
      `Conversion failed: pages=${pages.length} chars=${totalChars} elapsedMs=${Date.now() - startedAt}`,
      error,
    );
    throw error;
  }
}

/**
 * Parses the LLM's JSON pages response. If the JSON can't be parsed or has no
 * usable pages, the raw output is returned as a single page so a misbehaving
 * response degrades instead of failing the whole request.
 */
function parsePagesResponse(raw: string): Page[] {
  // Strip anything around the JSON object (DeepSeek sometimes adds prose).
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { pages?: unknown };
      if (Array.isArray(parsed.pages) && parsed.pages.length > 0) {
        return parsed.pages.map((entry, i) => {
          const page = (entry ?? {}) as { pageNumber?: unknown; text?: unknown };
          const pageNumber = Number(page.pageNumber);
          return {
            pageNumber: Number.isFinite(pageNumber) ? pageNumber : i + 1,
            text:
              typeof page.text === "string" ? page.text : String(page.text ?? ""),
          };
        });
      }
    } catch {
      // Malformed JSON — fall through to the single-page fallback.
    }
  }
  return [{ pageNumber: 1, text: raw }];
}
