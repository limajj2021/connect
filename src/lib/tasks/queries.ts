import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { TaskRow, TaskStatus } from "@/types/database";

export interface TaskWithContact extends TaskRow {
  contact: { id: string; name: string } | null;
}

type TaskJoinRow = TaskRow & { contact: { id: string; name: string } | null };

export interface TaskFilters {
  status?: TaskStatus;
  contactId?: string;
  limit?: number;
}

export async function listTasks(filters: TaskFilters = {}): Promise<TaskWithContact[]> {
  const supabase = await createClient();

  let query = supabase
    .from("tasks")
    .select("*, contact:contacts(id, name)")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.contactId) {
    query = query.eq("contact_id", filters.contactId);
  }
  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as TaskJoinRow[];
}

export async function listTasksForContact(contactId: string): Promise<TaskWithContact[]> {
  return listTasks({ contactId });
}

export async function countPendingTasks(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) throw error;
  return count ?? 0;
}
