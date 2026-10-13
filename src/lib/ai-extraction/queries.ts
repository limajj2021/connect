import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ChatExtractionRow, ReviewStatus } from "@/types/database";

export async function listChatExtractions(
  chatImportId: string,
  reviewStatus?: ReviewStatus,
): Promise<ChatExtractionRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("chat_extractions")
    .select("*")
    .eq("chat_import_id", chatImportId)
    .order("created_at", { ascending: false });
  if (reviewStatus) query = query.eq("review_status", reviewStatus);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ChatExtractionRow[];
}

export async function countPendingExtractions(chatImportId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("chat_extractions")
    .select("id", { count: "exact", head: true })
    .eq("chat_import_id", chatImportId)
    .eq("review_status", "pending");
  if (error) throw error;
  return count ?? 0;
}
