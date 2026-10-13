"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getChatImport } from "@/lib/chat-import/queries";
import type { ChatExtractionRow } from "@/types/database";

import { applyExtraction } from "./apply";
import { runAnalysis } from "./pipeline";

export interface AnalysisActionState {
  error?: string;
  message?: string;
}

async function getExtraction(extractionId: string): Promise<ChatExtractionRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("chat_extractions").select("*").eq("id", extractionId).maybeSingle();
  if (error) throw error;
  return data as ChatExtractionRow | null;
}

export async function approveExtraction(extractionId: string) {
  const extraction = await getExtraction(extractionId);
  if (!extraction || extraction.review_status !== "pending") return;

  await applyExtraction(extraction);
  const supabase = await createClient();
  await supabase.from("chat_extractions").update({ review_status: "accepted" }).eq("id", extractionId);
  revalidatePath(`/records/chats/${extraction.chat_import_id}`);
}

export async function rejectExtraction(extractionId: string) {
  const extraction = await getExtraction(extractionId);
  if (!extraction || extraction.review_status !== "pending") return;

  const supabase = await createClient();
  await supabase.from("chat_extractions").update({ review_status: "rejected" }).eq("id", extractionId);
  revalidatePath(`/records/chats/${extraction.chat_import_id}`);
}

export async function saveExtractionEdits(
  extractionId: string,
  updates: { title: string; description?: string; relatedContactName?: string | null; dueDate?: string | null },
) {
  const extraction = await getExtraction(extractionId);
  if (!extraction || extraction.review_status !== "pending") return;

  const supabase = await createClient();
  const nextPayload = { ...(extraction.payload as Record<string, unknown>), ...updates };
  const updated: ChatExtractionRow = { ...extraction, payload: nextPayload };

  await applyExtraction(updated);
  await supabase
    .from("chat_extractions")
    .update({ review_status: "edited", payload: nextPayload })
    .eq("id", extractionId);
  revalidatePath(`/records/chats/${extraction.chat_import_id}`);
}

export async function runAiAnalysis(chatImportId: string): Promise<AnalysisActionState> {
  const chatImport = await getChatImport(chatImportId);
  if (!chatImport) {
    return { error: "找不到這筆聊天匯入" };
  }

  const result = await runAnalysis(chatImport);
  revalidatePath(`/records/chats/${chatImportId}`);

  if (result.status === "noop") {
    return { message: "沒有新訊息需要分析" };
  }
  if (result.status === "failed") {
    return { error: result.error ?? "分析失敗" };
  }
  return { message: `已分析 ${result.chunksProcessed}/${result.chunksTotal} 個批次，產生 ${result.itemsExtracted} 筆擷取結果` };
}
