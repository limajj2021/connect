import "server-only";

import { createClient } from "@/lib/supabase/server";
import { listUnanalyzedMessages } from "@/lib/chat-import/queries";
import type { ChatImportRow } from "@/types/database";

import { chunkMessages } from "./chunk";
import { AiNotConfiguredError, getDefaultAiProvider, type AiExtractionProvider } from "./provider";
import type { ExtractionItem } from "./schema";

export interface RunAnalysisResult {
  status: "completed" | "failed" | "noop";
  chunksProcessed: number;
  chunksTotal: number;
  itemsExtracted: number;
  error?: string;
}

function toChatExtractionPayload(item: ExtractionItem) {
  const { category: _category, sourceMessageRefs: _refs, confidence: _confidence, ...payload } = item;
  return payload;
}

export async function runAnalysis(
  chatImport: ChatImportRow,
  providerOverride?: AiExtractionProvider,
): Promise<RunAnalysisResult> {
  const supabase = await createClient();

  const messages = await listUnanalyzedMessages(chatImport.id);
  if (messages.length === 0) {
    return { status: "noop", chunksProcessed: 0, chunksTotal: 0, itemsExtracted: 0 };
  }

  const chunks = chunkMessages(messages);

  let provider: AiExtractionProvider;
  try {
    provider = providerOverride ?? getDefaultAiProvider();
  } catch (err) {
    const message = err instanceof AiNotConfiguredError ? err.message : "AI 設定錯誤";
    return { status: "failed", chunksProcessed: 0, chunksTotal: chunks.length, itemsExtracted: 0, error: message };
  }

  const { data: run, error: runError } = await supabase
    .from("chat_analysis_runs")
    .insert({
      chat_import_id: chatImport.id,
      status: "processing",
      model_name: process.env.AI_MODEL ?? null,
      message_range_start: messages[0].sequence_no,
      message_range_end: messages[messages.length - 1].sequence_no,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (runError || !run) {
    return { status: "failed", chunksProcessed: 0, chunksTotal: chunks.length, itemsExtracted: 0, error: "無法建立分析任務" };
  }

  let itemsExtracted = 0;
  let chunksProcessed = 0;

  for (const chunk of chunks) {
    let response;
    try {
      response = await provider.extract(chunk, { chatName: chatImport.source_chat_name });
    } catch (err) {
      const message = err instanceof AiNotConfiguredError ? err.message : `AI 分析失敗：${(err as Error).message}`;
      await supabase
        .from("chat_analysis_runs")
        .update({ status: "failed", error_message: message, completed_at: new Date().toISOString() })
        .eq("id", run.id);
      return { status: "failed", chunksProcessed, chunksTotal: chunks.length, itemsExtracted, error: message };
    }

    const refToMessageId = new Map(chunk.messages.map((m) => [m.ref, m.id]));
    const extractionRows = response.items
      .map((item) => {
        const sourceMessageIds = item.sourceMessageRefs
          .map((ref) => refToMessageId.get(ref))
          .filter((id): id is string => Boolean(id));
        if (sourceMessageIds.length === 0) return null;
        return {
          chat_analysis_run_id: run.id,
          chat_import_id: chatImport.id,
          extraction_type: item.category,
          payload: toChatExtractionPayload(item),
          confidence: item.confidence,
          source_message_ids: sourceMessageIds,
          review_status: "pending" as const,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (extractionRows.length > 0) {
      const { error: insertError } = await supabase.from("chat_extractions").insert(extractionRows);
      if (insertError) {
        await supabase
          .from("chat_analysis_runs")
          .update({ status: "failed", error_message: "寫入擷取結果失敗", completed_at: new Date().toISOString() })
          .eq("id", run.id);
        return {
          status: "failed",
          chunksProcessed,
          chunksTotal: chunks.length,
          itemsExtracted,
          error: "寫入擷取結果失敗",
        };
      }
      itemsExtracted += extractionRows.length;
    }

    const messageIds = chunk.messages.map((m) => m.id);
    const { error: markError } = await supabase.from("chat_messages").update({ is_analyzed: true }).in("id", messageIds);
    if (markError) {
      await supabase
        .from("chat_analysis_runs")
        .update({ status: "failed", error_message: "更新訊息狀態失敗", completed_at: new Date().toISOString() })
        .eq("id", run.id);
      return {
        status: "failed",
        chunksProcessed,
        chunksTotal: chunks.length,
        itemsExtracted,
        error: "更新訊息狀態失敗",
      };
    }

    chunksProcessed += 1;
  }

  await supabase
    .from("chat_analysis_runs")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", run.id);

  return { status: "completed", chunksProcessed, chunksTotal: chunks.length, itemsExtracted };
}
