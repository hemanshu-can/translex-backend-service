import OpenAI from "openai";

const apiKey = process.env.DEEPSEEK_API_KEY;

// DeepSeek exposes an OpenAI-compatible API, so the `openai` SDK works as-is.
let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not set in the environment");
  }
  client ??= new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" });
  return client;
}

const SYSTEM_PROMPT =
  "You are a professional translator. Translate the provided Hindi text into " +
  "English. Preserve the original structure, paragraph breaks, and meaning. " +
  "Output only the translated text.";

export async function convertText(text: string): Promise<string> {
  const startedAt = Date.now();
  try {
    const completion = await getClient().chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    });
    const converted = completion.choices[0]?.message?.content ?? "";
    console.log(
      `Conversion done: chars=${text.length} elapsedMs=${Date.now() - startedAt}`,
    );
    return converted;
  } catch (error) {
    console.error(
      `Conversion failed: chars=${text.length} elapsedMs=${Date.now() - startedAt}`,
      error,
    );
    throw error;
  }
}
