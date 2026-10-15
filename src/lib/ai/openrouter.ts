import "server-only";

/**
 * One optional, opt-in AI touchpoint: "🤖 AI 客製化" on a greeting card,
 * drafting a message from the contact's details and recent interaction
 * history. Uses OpenRouter so a free model can be used — never called
 * automatically, and every caller must fall back to the rule-based template
 * on failure (missing key, rate limit, a free model being unavailable).
 *
 * Free OpenRouter models come and go and get rate-limited under shared load,
 * so a short ordered list is tried instead of pinning to one id. Set
 * OPENROUTER_MODEL to pin to exactly one (e.g. while testing a new one).
 */
const OPENROUTER_URL = process.env.OPENROUTER_URL ?? "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODELS = ["google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free", "dots-studio/dots-3-note-preview:free"];
const MODELS = process.env.OPENROUTER_MODEL ? [process.env.OPENROUTER_MODEL] : DEFAULT_MODELS;

const SYSTEM_PROMPT =
  "你是台灣人，只能用繁體字（台灣正體、台灣用語習慣）回覆，絕對不可以使用任何簡體字或中國大陸用語。" +
  "不要質疑、評論或反問使用者的要求（例如稱呼是否恰當），不要加任何說明、前言或建議，只要直接輸出使用者要的那一句訊息本文。";
// Common simplified-only glyphs — if any slip through despite the system
// prompt (a small/weak free model may ignore it), the result is rejected
// rather than sent to a real contact in the wrong script.
const SIMPLIFIED_TELLS = /[国会为这从后对应让问没听么个乐东现华长开关万儿时当过说兴谢业机体来还设计]/;
// A free model sometimes answers with a meta/clarifying reply instead of the
// one-line greeting asked for — too long, or itself asking a question back.
function looksLikeAGreeting(text: string) {
  return text.length <= 120 && !text.includes("？") && !text.includes("?");
}

export function isAiConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export type AiResult = { ok: true; text: string } | { ok: false; error: string };

async function tryModel(apiKey: string, model: string, prompt: string, maxTokens: number): Promise<AiResult> {
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        // OpenRouter's suggested attribution headers for free-tier routing; harmless if ignored.
        "HTTP-Referer": process.env.APP_BASE_URL ?? "https://github.com",
        // ASCII only — a non-Latin1 header value throws in undici/fetch.
        "X-Title": "Personal CRM (LINE assistant)",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.8,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `${model} 回應 ${res.status}${body ? `：${body.slice(0, 160)}` : ""}` };
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) return { ok: false, error: `${model} 沒有回覆內容` };
    if (SIMPLIFIED_TELLS.test(content)) return { ok: false, error: `${model} 用了簡體字` };
    if (!looksLikeAGreeting(content)) return { ok: false, error: `${model} 回了說明而不是訊息本文` };
    return { ok: true, text: content };
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.name === "TimeoutError" ? `${model} 逾時` : `${model} 連線失敗` };
  }
}

/** Tries each configured free model in turn. Never throws — callers always have a template to fall back to. */
export async function aiComplete(prompt: string, opts: { maxTokens?: number } = {}): Promise<AiResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { ok: false, error: "尚未設定 OPENROUTER_API_KEY" };

  const errors: string[] = [];
  for (const model of MODELS) {
    const result = await tryModel(apiKey, model, prompt, opts.maxTokens ?? 200);
    if (result.ok) return result;
    errors.push(result.error);
  }
  return { ok: false, error: errors.join("；") };
}
