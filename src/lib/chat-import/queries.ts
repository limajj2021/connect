import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ChatImportRow, ChatMessageRow } from "@/types/database";

export interface ChatImportWithContact extends ChatImportRow {
  primary_contact: { id: string; name: string } | null;
}

type ChatImportJoinRow = ChatImportRow & { primary_contact: { id: string; name: string } | null };

export async function listChatImports(): Promise<ChatImportWithContact[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_imports")
    .select("*, primary_contact:contacts(id, name)")
    .order("imported_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ChatImportJoinRow[];
}

export interface ChatParticipantRow {
  id: string;
  display_name: string;
  contact_id: string | null;
  is_linked: boolean;
  contact: { id: string; name: string } | null;
}

export async function getChatImport(id: string): Promise<ChatImportWithContact | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_imports")
    .select("*, primary_contact:contacts(id, name)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as ChatImportJoinRow | null;
}

export async function listChatParticipants(chatImportId: string): Promise<ChatParticipantRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_participants")
    .select("id, display_name, contact_id, is_linked, contact:contacts(id, name)")
    .eq("chat_import_id", chatImportId);
  if (error) throw error;
  return (data ?? []) as unknown as ChatParticipantRow[];
}

export interface ChatMessageFilters {
  q?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function listChatMessages(
  chatImportId: string,
  filters: ChatMessageFilters = {},
): Promise<ChatMessageRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("chat_messages")
    .select("*")
    .eq("chat_import_id", chatImportId)
    .order("sequence_no", { ascending: true });

  if (filters.q) {
    const term = filters.q.trim();
    if (term) query = query.ilike("message_text", `%${term}%`);
  }
  if (filters.dateFrom) query = query.gte("sent_at", filters.dateFrom);
  if (filters.dateTo) query = query.lte("sent_at", `${filters.dateTo}T23:59:59+08:00`);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ChatMessageRow[];
}

export async function listUnanalyzedMessages(chatImportId: string): Promise<ChatMessageRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("chat_import_id", chatImportId)
    .eq("is_analyzed", false)
    .order("sequence_no", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ChatMessageRow[];
}

export async function listChatImportsForContact(contactId: string): Promise<ChatImportWithContact[]> {
  const supabase = await createClient();
  const { data: viaParticipant, error: participantError } = await supabase
    .from("chat_participants")
    .select("chat_import_id")
    .eq("contact_id", contactId);
  if (participantError) throw participantError;

  const importIds = [...new Set((viaParticipant ?? []).map((p) => p.chat_import_id))];
  if (importIds.length === 0) return [];

  const { data, error } = await supabase
    .from("chat_imports")
    .select("*, primary_contact:contacts(id, name)")
    .in("id", importIds)
    .order("imported_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ChatImportJoinRow[];
}
