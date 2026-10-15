import "server-only";

import type { BotCtx } from "./data";
import { type ContactDraft, normalizeText } from "./extract";

/**
 * Batch import from list screenshots. Each screenshot's names are parked in a
 * row of their own (bot_sessions, keyed "<userId>:shot:<messageId>"), so
 * several screenshots sent at once — handled by parallel webhook calls — never
 * overwrite each other. The batch is everything parked and not yet expired.
 */
export type BatchCtx = Pick<BotCtx, "supabase" | "ownerId" | "lineUserId">;

export interface BatchEntry {
  key: string;
  draft: ContactDraft;
  /** An existing contact this is (probably) the same person as. */
  existing?: { id: string; name: string };
}

interface ShotState {
  flow: "shot";
  setId?: string;
  drafts: ContactDraft[];
}

const SHOT_TTL_MS = 60 * 60 * 1000;
const shotPrefix = (ctx: BatchCtx) => `${ctx.lineUserId}:shot:`;

export const entryKey = (value: string) =>
  normalizeText(value)
    .toLowerCase()
    .replace(/[\s*@·•._-]/g, "");

export async function saveShot(ctx: BatchCtx, messageId: string, drafts: ContactDraft[], setId?: string) {
  await ctx.supabase
    .from("bot_sessions")
    .delete()
    .eq("owner_id", ctx.ownerId)
    .like("line_user_id", `${shotPrefix(ctx)}%`)
    .lt("expires_at", new Date().toISOString());
  const { error } = await ctx.supabase.from("bot_sessions").upsert(
    {
      owner_id: ctx.ownerId,
      line_user_id: `${shotPrefix(ctx)}${messageId}`,
      state: { flow: "shot", drafts, ...(setId ? { setId } : {}) } satisfies ShotState,
      expires_at: new Date(Date.now() + SHOT_TTL_MS).toISOString(),
    },
    { onConflict: "line_user_id" },
  );
  if (error) throw error;
}

async function loadShots(ctx: BatchCtx): Promise<ShotState[]> {
  const { data, error } = await ctx.supabase
    .from("bot_sessions")
    .select("state")
    .eq("owner_id", ctx.ownerId)
    .like("line_user_id", `${shotPrefix(ctx)}%`)
    .gt("expires_at", new Date().toISOString())
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((r) => r.state as ShotState).filter((s) => s?.flow === "shot");
}

export async function clearShots(ctx: BatchCtx) {
  const { error } = await ctx.supabase
    .from("bot_sessions")
    .delete()
    .eq("owner_id", ctx.ownerId)
    .like("line_user_id", `${shotPrefix(ctx)}%`);
  if (error) throw error;
}

/** Waits (briefly) until every image of a multi-image send has been read. */
export async function waitForImageSet(ctx: BatchCtx, setId: string, total: number, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const shots = await loadShots(ctx);
    if (shots.filter((s) => s.setId === setId).length >= total) return;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

/** The pending batch, de-duplicated, with people already in the CRM marked. */
export async function loadBatch(ctx: BatchCtx): Promise<BatchEntry[]> {
  const shots = await loadShots(ctx);
  const byKey = new Map<string, BatchEntry>();
  for (const draft of shots.flatMap((s) => s.drafts)) {
    const key = entryKey(draft.line_display_name ?? draft.name ?? "");
    if (key && !byKey.has(key)) byKey.set(key, { key, draft });
  }
  if (byKey.size === 0) return [];

  const { data, error } = await ctx.supabase
    .from("contacts")
    .select("id, name, line_display_name")
    .eq("owner_id", ctx.ownerId)
    .limit(5000);
  if (error) throw error;
  const contacts = (data ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    keys: [c.name as string, (c.line_display_name as string | null) ?? ""].map(entryKey).filter(Boolean),
  }));

  for (const entry of byKey.values()) {
    const keys = [entry.draft.line_display_name, entry.draft.name].filter(Boolean).map((v) => entryKey(v!));
    const exact = contacts.find((c) => c.keys.some((k) => keys.includes(k)));
    // "Kenny" already saved, screenshot says "Kenny 吳副 @印度班加" → probably him.
    const partial =
      exact ??
      contacts.find((c) => {
        const short = entryKey(c.name);
        return short.length >= (/^[a-z]+$/.test(short) ? 3 : 2) && keys.some((k) => k.includes(short));
      });
    if (partial) entry.existing = { id: partial.id, name: partial.name };
  }
  return [...byKey.values()];
}

/** Creates the given contacts (one insert) and optionally tags all of them. */
export async function createBatch(ctx: BatchCtx, drafts: ContactDraft[], tags: string[] = []) {
  if (drafts.length === 0) return [];
  const { data, error } = await ctx.supabase
    .from("contacts")
    .insert(
      drafts.map((d) => {
        const row: Record<string, unknown> = { owner_id: ctx.ownerId, met_channel: "LINE 截圖" };
        for (const [k, v] of Object.entries(d)) if (v !== undefined && v !== "") row[k] = v;
        return row;
      }),
    )
    .select("id, name");
  if (error) throw error;
  const created = (data ?? []) as { id: string; name: string }[];

  const names = [...new Set(tags.map((t) => t.trim()).filter(Boolean))].slice(0, 20);
  if (names.length > 0 && created.length > 0) {
    const { error: upsertError } = await ctx.supabase
      .from("industries")
      .upsert(names.map((name) => ({ name, owner_id: ctx.ownerId })), { onConflict: "owner_id,name", ignoreDuplicates: true });
    if (upsertError) throw upsertError;
    const { data: industries, error: fetchError } = await ctx.supabase
      .from("industries")
      .select("id")
      .eq("owner_id", ctx.ownerId)
      .in("name", names);
    if (fetchError) throw fetchError;
    const links = created.flatMap((c) => (industries ?? []).map((i) => ({ contact_id: c.id, industry_id: i.id })));
    const { error: linkError } = await ctx.supabase.from("contact_industries").insert(links);
    if (linkError) throw linkError;
  }
  return created;
}
