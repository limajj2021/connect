import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sha256Hex } from "@/lib/chat-import/hash";
import { parseLineChatExport, type ParsedChat, type ParsedMessage } from "@/lib/chat-import/line-parser";
import { OWNER_SENDER_LABEL, type ParticipantMapping } from "@/lib/chat-import/schema";

const INSERT_BATCH_SIZE = 500;

function toTimestamp(date: string, time: string): string {
  return `${date}T${time}:00+08:00`;
}

async function chunkedInsert(supabase: SupabaseClient, table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + INSERT_BATCH_SIZE));
    if (error) throw error;
  }
}

export type ChatImportResult =
  | {
      ok: true;
      importId: string;
      chatName: string | null;
      chatType: "individual" | "group";
      messageCount: number;
      participants: { name: string; contactId: string | null; created: boolean }[];
      parsed: ParsedChat;
    }
  | { ok: false; error: string; existingImportId?: string };

/**
 * Parses a LINE TXT export and stores it (original file, import row,
 * participants, messages). Shared by the web upload action (session client,
 * RLS) and the LINE bot (service-role client) — so every insert into an
 * owner-scoped table sets owner_id explicitly instead of relying on the
 * auth.uid() column default.
 */
export async function importLineChatFile(opts: {
  supabase: SupabaseClient;
  ownerId: string;
  fileName: string;
  buffer: ArrayBuffer;
  /** Decides link/create/skip per participant once the file is parsed. */
  resolveMapping: (participants: string[]) => Promise<ParticipantMapping> | ParticipantMapping;
}): Promise<ChatImportResult> {
  const { supabase, ownerId, fileName, buffer } = opts;
  const fileHash = await sha256Hex(buffer);

  const { data: existing, error: existingError } = await supabase
    .from("chat_imports")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("file_hash", fileHash)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    return { ok: false, error: "這個檔案先前已經匯入過了", existingImportId: existing.id as string };
  }

  const parsed = parseLineChatExport(new TextDecoder("utf-8").decode(buffer));
  if (parsed.messages.length === 0) {
    return { ok: false, error: "無法解析任何訊息，請確認檔案是否為 LINE 聊天記錄 TXT 匯出檔" };
  }

  const realParticipants = parsed.participants.filter((p) => p !== OWNER_SENDER_LABEL);
  const chatType: "individual" | "group" = realParticipants.length > 1 ? "group" : "individual";
  const mapping = await opts.resolveMapping(realParticipants);

  // Resolve each participant to a contact: link to an existing one, create a new
  // one from their LINE display name, or leave unmatched.
  const resolved = new Map<string, { contactId: string | null; created: boolean }>();
  for (const name of realParticipants) {
    const decision = mapping[name];
    if (decision?.action === "link") {
      resolved.set(name, { contactId: decision.contactId, created: false });
    } else if (decision?.action === "create") {
      const { data, error } = await supabase
        .from("contacts")
        .insert({ owner_id: ownerId, name, line_display_name: name })
        .select("id")
        .single();
      if (error) throw error;
      resolved.set(name, { contactId: data.id as string, created: true });
    } else {
      resolved.set(name, { contactId: null, created: false });
    }
  }
  const contactIdOf = (name: string | null) => (name ? (resolved.get(name)?.contactId ?? null) : null);

  // Cross-import dedupe: messages that exactly match ones already analyzed in a
  // previous import of the same named chat are pre-marked analyzed, so the AI
  // pipeline never re-extracts the same topics/tasks from a re-imported history.
  const priorAnalyzedHashes = new Set<string>();
  if (parsed.chatName) {
    const { data: priorMessages, error: priorError } = await supabase
      .from("chat_messages")
      .select("dedupe_hash, is_analyzed, chat_imports!inner(source_chat_name, owner_id)")
      .eq("chat_imports.source_chat_name", parsed.chatName)
      .eq("chat_imports.owner_id", ownerId)
      .eq("is_analyzed", true);
    if (priorError) throw priorError;
    for (const row of priorMessages ?? []) {
      if (row.dedupe_hash) priorAnalyzedHashes.add(row.dedupe_hash as string);
    }
  }

  const storagePath = `${ownerId}/${fileHash}.txt`;
  const { error: uploadError } = await supabase.storage
    .from("chat-imports")
    .upload(storagePath, buffer, { contentType: "text/plain; charset=utf-8", upsert: true });
  if (uploadError) {
    return { ok: false, error: "原始檔案上傳失敗，請稍後再試" };
  }

  const { data: chatImport, error: importError } = await supabase
    .from("chat_imports")
    .insert({
      owner_id: ownerId,
      file_name: fileName,
      file_hash: fileHash,
      storage_path: storagePath,
      source_chat_name: parsed.chatName,
      chat_type: chatType,
      primary_contact_id: chatType === "individual" ? contactIdOf(realParticipants[0] ?? null) : null,
      parse_status: "completed",
      parse_error: parsed.warnings.length > 0 ? parsed.warnings.join("\n") : null,
      message_count: parsed.messages.length,
    })
    .select("id")
    .single();
  if (importError || !chatImport) {
    return { ok: false, error: "建立匯入紀錄失敗，請稍後再試" };
  }
  const importId = chatImport.id as string;

  const participantRows = realParticipants.map((name) => ({
    chat_import_id: importId,
    display_name: name,
    contact_id: contactIdOf(name),
    is_linked: Boolean(contactIdOf(name)),
  }));
  if (participantRows.length > 0) {
    await chunkedInsert(supabase, "chat_participants", participantRows);
  }

  const messageRows = parsed.messages.map((message: ParsedMessage) => ({
    chat_import_id: importId,
    speaker_display_name: message.sender,
    contact_id: contactIdOf(message.sender),
    message_text: message.text,
    message_type: message.messageType,
    sent_at: toTimestamp(message.date, message.time),
    sequence_no: message.sequenceNo,
    raw_line_ref: message.rawLineRef,
    dedupe_hash: message.dedupeHash,
    is_analyzed: priorAnalyzedHashes.has(message.dedupeHash),
  }));
  await chunkedInsert(supabase, "chat_messages", messageRows);

  return {
    ok: true,
    importId,
    chatName: parsed.chatName,
    chatType,
    messageCount: parsed.messages.length,
    participants: realParticipants.map((name) => ({
      name,
      contactId: resolved.get(name)?.contactId ?? null,
      created: resolved.get(name)?.created ?? false,
    })),
    parsed,
  };
}
