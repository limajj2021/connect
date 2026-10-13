import "server-only";

import type { MessageChunk } from "./chunk";
import { extractionResponseSchema, type ExtractionResponse } from "./schema";

export interface ExtractionContext {
  chatName: string | null;
}

export interface AiExtractionProvider {
  extract(chunk: MessageChunk, context: ExtractionContext): Promise<ExtractionResponse>;
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("尚未設定 AI_PROVIDER_API_KEY / AI_MODEL");
    this.name = "AiNotConfiguredError";
  }
}

const SYSTEM_PROMPT = `你是個人 CRM 應用程式的聊天記錄分析助手。你會收到一段 LINE 聊天記錄片段（每則訊息有一個 ref 編號、時間、發言者、內容），任務是擷取其中與人脈管理有關的結構化資訊。

規則（必須嚴格遵守）：
1. 只能根據訊息中「明確出現」的內容擷取資訊，絕對不可以憑空猜測或自行推論。
2. 不可以在沒有明確根據的情況下，推論某人的公司或職稱；如果訊息沒有明講，就把該欄位留空（null），並將 confidence 設為 "needs_review"。
3. 保留不確定性：若身分、日期、待辦內容有任何模糊之處，confidence 必須設為 "needs_review"；只有在訊息內容明確無歧義時才設為 "confirmed"。
4. 不可以自動合併可能是不同人的名字（例如兩個相似的名字不要假設是同一人）。
5. 每一筆擷取結果都必須提供 sourceMessageRefs（引用的訊息 ref 編號），至少一個。
6. 不要擷取與人脈管理無關的閒聊內容。
7. 以呼叫 record_extractions 工具的方式回傳結果，不要輸出其他文字。`;

const TOOL_INPUT_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string", enum: ["person", "company", "topic", "fact", "date_event", "todo"] },
          title: { type: "string" },
          description: { type: "string" },
          relatedContactName: { type: ["string", "null"] },
          sourceMessageRefs: { type: "array", items: { type: "integer" } },
          confidence: { type: "string", enum: ["confirmed", "needs_review"] },
          companyName: { type: ["string", "null"] },
          jobTitle: { type: ["string", "null"] },
          lineName: { type: ["string", "null"] },
          relationshipNotes: { type: ["string", "null"] },
          assignee: { type: ["string", "null"] },
          dueDate: { type: ["string", "null"], description: "YYYY-MM-DD" },
          isCompleted: { type: "boolean" },
          eventDate: { type: ["string", "null"], description: "YYYY-MM-DD" },
        },
        required: ["category", "title", "sourceMessageRefs", "confidence"],
      },
    },
  },
  required: ["items"],
};

function buildUserMessage(chunk: MessageChunk, context: ExtractionContext): string {
  const header = context.chatName ? `聊天室名稱：${context.chatName}\n` : "";
  const lines = chunk.messages.map((m) => `[ref=${m.ref}] ${m.time} ${m.sender}: ${m.text}`).join("\n");
  return `${header}以下是聊天記錄片段：\n\n${lines}`;
}

/**
 * Default provider: Anthropic's Messages API with a forced tool call so the
 * response is always well-formed JSON matching our schema. Swap this for a
 * different `AiExtractionProvider` implementation to use another model
 * without touching the pipeline.
 */
export class AnthropicExtractionProvider implements AiExtractionProvider {
  private apiKey: string;
  private model: string;

  constructor() {
    const apiKey = process.env.AI_PROVIDER_API_KEY;
    const model = process.env.AI_MODEL;
    if (!apiKey || !model) throw new AiNotConfiguredError();
    this.apiKey = apiKey;
    this.model = model;
  }

  async extract(chunk: MessageChunk, context: ExtractionContext): Promise<ExtractionResponse> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserMessage(chunk, context) }],
        tools: [{ name: "record_extractions", description: "記錄擷取結果", input_schema: TOOL_INPUT_SCHEMA }],
        tool_choice: { type: "tool", name: "record_extractions" },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`AI 服務呼叫失敗（${response.status}）：${body.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; input?: unknown }>;
    };
    const toolUse = data.content.find((block) => block.type === "tool_use");
    if (!toolUse) {
      throw new Error("AI 回應未包含預期的結構化結果");
    }

    const parsed = extractionResponseSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      throw new Error(`AI 回應格式不符合預期：${parsed.error.issues[0]?.message ?? "未知錯誤"}`);
    }
    return parsed.data;
  }
}

export function getDefaultAiProvider(): AiExtractionProvider {
  return new AnthropicExtractionProvider();
}
