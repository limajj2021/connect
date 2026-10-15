import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Bulk on/off for `contacts.festival_reminder_enabled` — a contact either gets every enabled greeting occasion, or none. */
type FestivalCtx = { supabase: SupabaseClient; ownerId: string };

export interface ContactFestivalSetting {
  id: string;
  name: string;
  company: string | null;
  festival_reminder_enabled: boolean;
}

export async function listContactFestivalSettings(ctx: FestivalCtx): Promise<ContactFestivalSetting[]> {
  const { data, error } = await ctx.supabase
    .from("contacts")
    .select("id, name, company, festival_reminder_enabled")
    .eq("owner_id", ctx.ownerId)
    .order("name");
  if (error) throw error;
  return (data ?? []) as ContactFestivalSetting[];
}

export async function setFestivalReminderEnabled(ctx: FestivalCtx, contactIds: string[], enabled: boolean): Promise<number> {
  const ids = [...new Set(contactIds)];
  if (ids.length === 0) return 0;
  const { data, error } = await ctx.supabase
    .from("contacts")
    .update({ festival_reminder_enabled: enabled })
    .eq("owner_id", ctx.ownerId)
    .in("id", ids)
    .select("id");
  if (error) throw error;
  return (data ?? []).length;
}
