"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient, getAuthUser } from "@/lib/supabase/server";
import { parseLineChatExport, type ParsedMessage } from "@/lib/chat-import/line-parser";
import { sha256Hex } from "@/lib/chat-import/hash";
import {
  MAX_IMPORT_FILE_BYTES,
  OWNER_SENDER_LABEL,
  participantMappingSchema,
  type ParticipantMapping,
} from "@/lib/chat-import/schema";
import { findChatImportByFileHash } from "@/lib/chat-import/queries";

export interface ImportActionState {
  error?: string;
  existingImportId?: string;
}

const INSERT_BATCH_SIZE = 500;

function toTimestamp(date: string, time: string): string {
  return `${date}T${time}:00+08:00`;
}

async function chunkedInsert(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  rows: Record<string, unknown>[],
) {
  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + INSERT_BATCH_SIZE);
    const { error } = await supabase.from(table).insert(batch);
    if (error) throw error;
  }
}

export async function importChat(_prev: ImportActionState, formData: FormData): Promise<ImportActionState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "請選擇要匯入的 LINE 聊天記錄 TXT 檔案" };
  }
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return { error: `檔案過大（上限 ${Math.floor(MAX_IMPORT_FILE_BYTES / 1024 / 1024)}MB）` };
  }
  if (!file.name.toLowerCase().endsWith(".txt")) {
    return { error: "僅支援 LINE 匯出的 .txt 檔案" };
  }

  const mappingRaw = formData.get("mapping");
  const mappingParsed = participantMappingSchema.safeParse(
    mappingRaw ? JSON.parse(String(mappingRaw)) : {},
  );
  if (!mappingParsed.success) {
    return { error: "人脈對應資料格式錯誤" };
  }
  const mapping: ParticipantMapping = mappingParsed.data;

  const buffer = await file.arrayBuffer();
  const fileHash = await sha256Hex(buffer);

  const existing = await findChatImportByFileHash(fileHash);
  if (existing) {
    return { error: "這個檔案先前已經匯入過了", existingImportId: existing.id };
  }

  const text = new TextDecoder("utf-8").decode(buffer);
  const parsed = parseLineChatExport(text);

  if (parsed.messages.length === 0) {
    return { error: "無法解析任何訊息，請確認檔案是否為 LINE 聊天記錄 TXT 匯出檔" };
  }

  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) {
    return { error: "請重新登入後再試一次" };
  }

  const realParticipants = parsed.participants.filter((p) => p !== OWNER_SENDER_LABEL);
  const chatType: "individual" | "group" = realParticipants.length > 1 ? "group" : "individual";

  // Resolve each participant to a contact: link to an existing one, create a new
  // one from their LINE display name, or leave unmatched.
  const resolvedContactIds = new Map<string, string | null>();
  for (const name of realParticipants) {
    const decision = mapping[name];
    if (decision?.action === "link") {
      resolvedContactIds.set(name, decision.contactId);
    } else if (decision?.action === "create") {
      const { data, error } = await supabase
        .from("contacts")
        .insert({ name, line_display_name: name })
        .select("id")
        .single();
      if (error) throw error;
      resolvedContactIds.set(name, data.id);
    } else {
      resolvedContactIds.set(name, null);
    }
  }

  // Cross-import dedupe: messages that exactly match ones already analyzed in a
  // previous import of the same named chat are pre-marked analyzed, so the AI
  // pipeline never re-extracts the same topics/tasks from a re-imported history.
  const priorAnalyzedHashes = new Set<string>();
  if (parsed.chatName) {
    const { data: priorMessages, error: priorError } = await supabase
      .from("chat_messages")
      .select("dedupe_hash, is_analyzed, chat_imports!inner(source_chat_name)")
      .eq("chat_imports.source_chat_name", parsed.chatName)
      .eq("is_analyzed", true);
    if (priorError) throw priorError;
    for (const row of priorMessages ?? []) {
      if (row.dedupe_hash) priorAnalyzedHashes.add(row.dedupe_hash);
    }
  }

  const storagePath = `${user.id}/${fileHash}.txt`;
  const { error: uploadError } = await supabase.storage
    .from("chat-imports")
    .upload(storagePath, buffer, { contentType: "text/plain; charset=utf-8", upsert: true });
  if (uploadError) {
    return { error: "原始檔案上傳失敗，請稍後再試" };
  }

  const { data: chatImport, error: importError } = await supabase
    .from("chat_imports")
    .insert({
      file_name: file.name,
      file_hash: fileHash,
      storage_path: storagePath,
      source_chat_name: parsed.chatName,
      chat_type: chatType,
      primary_contact_id: chatType === "individual" ? (resolvedContactIds.get(realParticipants[0]) ?? null) : null,
      parse_status: "completed",
      parse_error: parsed.warnings.length > 0 ? parsed.warnings.join("\n") : null,
      message_count: parsed.messages.length,
    })
    .select("id")
    .single();

  if (importError || !chatImport) {
    return { error: "建立匯入紀錄失敗，請稍後再試" };
  }

  const participantRows = realParticipants.map((name) => ({
    chat_import_id: chatImport.id,
    display_name: name,
    contact_id: resolvedContactIds.get(name) ?? null,
    is_linked: Boolean(resolvedContactIds.get(name)),
  }));
  if (participantRows.length > 0) {
    await chunkedInsert(supabase, "chat_participants", participantRows);
  }

  const messageRows = parsed.messages.map((message: ParsedMessage) => ({
    chat_import_id: chatImport.id,
    speaker_display_name: message.sender,
    contact_id: message.sender ? (resolvedContactIds.get(message.sender) ?? null) : null,
    message_text: message.text,
    message_type: message.messageType,
    sent_at: toTimestamp(message.date, message.time),
    sequence_no: message.sequenceNo,
    raw_line_ref: message.rawLineRef,
    dedupe_hash: message.dedupeHash,
    is_analyzed: priorAnalyzedHashes.has(message.dedupeHash),
  }));
  await chunkedInsert(supabase, "chat_messages", messageRows);

  revalidatePath("/records");
  redirect(`/records/chats/${chatImport.id}`);
}

export async function deleteChatImport(chatImportId: string, storagePath: string) {
  const supabase = await createClient();
  const { error: storageError } = await supabase.storage.from("chat-imports").remove([storagePath]);
  if (storageError) {
    throw new Error("刪除原始檔案失敗，請稍後再試");
  }
  const { error } = await supabase.from("chat_imports").delete().eq("id", chatImportId);
  if (error) throw new Error("刪除失敗，請稍後再試");

  revalidatePath("/records");
  redirect("/records");
}
