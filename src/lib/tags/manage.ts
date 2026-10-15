import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Owner-scoped tag (industry) management — rename, merge, delete. Contact-level tagging lives in src/lib/mini/tags.ts. */
type TagCtx = { supabase: SupabaseClient; ownerId: string };

export interface TagWithCount {
  id: string;
  name: string;
  contactCount: number;
}

export async function listTagsWithCounts(ctx: TagCtx): Promise<TagWithCount[]> {
  const { data, error } = await ctx.supabase
    .from("industries")
    .select("id, name, contact_industries(contact_id)")
    .eq("owner_id", ctx.ownerId)
    .order("name");
  if (error) throw error;
  return (data ?? [])
    .map((row) => ({
      id: row.id as string,
      name: row.name as string,
      contactCount: ((row.contact_industries ?? []) as unknown[]).length,
    }))
    .sort((a, b) => b.contactCount - a.contactCount || a.name.localeCompare(b.name));
}

export async function renameTag(ctx: TagCtx, id: string, name: string): Promise<TagWithCount> {
  const trimmed = name.trim().slice(0, 50);
  if (!trimmed) throw new Error("標籤名稱不能是空的");
  const { data, error } = await ctx.supabase
    .from("industries")
    .update({ name: trimmed })
    .eq("owner_id", ctx.ownerId)
    .eq("id", id)
    .select("id, name")
    .single();
  if (error) throw error;
  return { id: data.id as string, name: data.name as string, contactCount: 0 };
}

/**
 * Merges `sourceIds` into one tag named `targetName` (an existing tag, kept —
 * or a brand-new name, created). Every contact that had any of the source
 * tags ends up with the merged tag instead; a contact that already had both
 * just keeps one link (upsert ignores the duplicate). The source tags are
 * deleted once their links are moved.
 */
export async function mergeTags(ctx: TagCtx, sourceIds: string[], targetName: string): Promise<TagWithCount> {
  const name = targetName.trim().slice(0, 50);
  if (!name) throw new Error("請輸入合併後的標籤名稱");
  const ids = [...new Set(sourceIds)];
  if (ids.length < 1) throw new Error("請至少選一個標籤");

  const { data: target, error: upsertError } = await ctx.supabase
    .from("industries")
    .upsert({ owner_id: ctx.ownerId, name }, { onConflict: "owner_id,name" })
    .select("id, name")
    .single();
  if (upsertError) throw upsertError;
  const targetId = target.id as string;

  const otherIds = ids.filter((id) => id !== targetId);
  if (otherIds.length > 0) {
    const { data: links, error: linksError } = await ctx.supabase
      .from("contact_industries")
      .select("contact_id")
      .in("industry_id", otherIds);
    if (linksError) throw linksError;
    const contactIds = [...new Set((links ?? []).map((l) => l.contact_id as string))];
    if (contactIds.length > 0) {
      const { error: relinkError } = await ctx.supabase
        .from("contact_industries")
        .upsert(
          contactIds.map((contact_id) => ({ contact_id, industry_id: targetId })),
          { onConflict: "contact_id,industry_id", ignoreDuplicates: true },
        );
      if (relinkError) throw relinkError;
    }
    const { error: deleteError } = await ctx.supabase.from("industries").delete().eq("owner_id", ctx.ownerId).in("id", otherIds);
    if (deleteError) throw deleteError;
  }

  const [{ data: countRows, error: countError }] = await Promise.all([
    ctx.supabase.from("contact_industries").select("contact_id").eq("industry_id", targetId),
  ]);
  if (countError) throw countError;
  return { id: targetId, name: target.name as string, contactCount: (countRows ?? []).length };
}

/** Deletes a tag outright (cascades the contact_industries links; nobody loses their contact, just the tag). */
export async function deleteTag(ctx: TagCtx, id: string) {
  const { error } = await ctx.supabase.from("industries").delete().eq("owner_id", ctx.ownerId).eq("id", id);
  if (error) throw error;
}
