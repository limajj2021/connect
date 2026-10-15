import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

import type { GreetingOccasion } from "./taiwan-holidays";

/**
 * Owner-scoped CRUD for greeting occasions — shared by the web app (signed-in
 * session, RLS scopes rows automatically), the LINE bot and cron (service
 * role, no session, so `ctx` is required), and the LIFF settings page.
 */
type OccasionCtx = { supabase: SupabaseClient; ownerId: string };

const COLUMNS = "id, name, calendar, month, day, lead_days, enabled";

export async function listOccasions(ctx?: OccasionCtx, opts: { enabledOnly?: boolean } = {}): Promise<GreetingOccasion[]> {
  const supabase = ctx?.supabase ?? (await createClient());
  let query = supabase.from("greeting_occasions").select(COLUMNS).order("created_at");
  if (ctx) query = query.eq("owner_id", ctx.ownerId);
  if (opts.enabledOnly) query = query.eq("enabled", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as GreetingOccasion[];
}

export interface OccasionInput {
  name: string;
  calendar: "lunar" | "solar";
  month: number;
  day: number;
  lead_days: number;
}

export async function createOccasion(ctx: OccasionCtx, input: OccasionInput): Promise<GreetingOccasion> {
  const { data, error } = await ctx.supabase
    .from("greeting_occasions")
    .insert({ ...input, owner_id: ctx.ownerId })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data as GreetingOccasion;
}

export async function updateOccasion(ctx: OccasionCtx, id: string, patch: Partial<OccasionInput & { enabled: boolean }>) {
  const { data, error } = await ctx.supabase
    .from("greeting_occasions")
    .update(patch)
    .eq("owner_id", ctx.ownerId)
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data as GreetingOccasion | null;
}

export async function deleteOccasion(ctx: OccasionCtx, id: string) {
  const { error } = await ctx.supabase.from("greeting_occasions").delete().eq("owner_id", ctx.ownerId).eq("id", id);
  if (error) throw error;
}
