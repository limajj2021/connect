import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Owner-scoped tag (industry) helpers for the service-role mini-app. */
export async function listTagNames(supabase: SupabaseClient, ownerId: string): Promise<string[]> {
  const { data, error } = await supabase.from("industries").select("name").eq("owner_id", ownerId).order("name");
  if (error) throw error;
  return (data ?? []).map((r) => r.name as string);
}

export async function contactTagNames(supabase: SupabaseClient, contactId: string): Promise<string[]> {
  const { data, error } = await supabase.from("contact_industries").select("industries(name)").eq("contact_id", contactId);
  if (error) throw error;
  return (data ?? [])
    .map((r) => (r.industries as unknown as { name: string } | null)?.name)
    .filter((n): n is string => Boolean(n));
}

export async function setContactTags(supabase: SupabaseClient, ownerId: string, contactId: string, names: string[]) {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 20);
  if (unique.length > 0) {
    const { error } = await supabase
      .from("industries")
      .upsert(unique.map((name) => ({ name, owner_id: ownerId })), { onConflict: "owner_id,name", ignoreDuplicates: true });
    if (error) throw error;
  }
  const { error: deleteError } = await supabase.from("contact_industries").delete().eq("contact_id", contactId);
  if (deleteError) throw deleteError;
  if (unique.length === 0) return;
  const { data: rows, error: fetchError } = await supabase
    .from("industries")
    .select("id")
    .eq("owner_id", ownerId)
    .in("name", unique);
  if (fetchError) throw fetchError;
  const { error: linkError } = await supabase
    .from("contact_industries")
    .insert((rows ?? []).map((r) => ({ contact_id: contactId, industry_id: r.id })));
  if (linkError) throw linkError;
}
