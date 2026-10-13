import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { FestivalKey, ReminderRow, ReminderType, TaskStatus } from "@/types/database";

export interface ReminderWithContact extends ReminderRow {
  contact: { id: string; name: string } | null;
}

type ReminderJoinRow = ReminderRow & { contact: { id: string; name: string } | null };

export interface ReminderFilters {
  status?: TaskStatus;
  reminderType?: ReminderType;
  festivalKey?: FestivalKey;
}

export async function listReminders(filters: ReminderFilters = {}): Promise<ReminderWithContact[]> {
  const supabase = await createClient();

  let query = supabase
    .from("reminders")
    .select("*, contact:contacts(id, name)")
    .order("due_date", { ascending: true });

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.reminderType) query = query.eq("reminder_type", filters.reminderType);
  if (filters.festivalKey) query = query.eq("festival_key", filters.festivalKey);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ReminderJoinRow[];
}

export async function countPendingReminders(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("reminders")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) throw error;
  return count ?? 0;
}
