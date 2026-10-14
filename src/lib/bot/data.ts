import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ContactForCard } from "@/lib/line/flex";
import type { FestivalKey, ReminderType, RoleType, TaskStatus } from "@/types/database";

import type { ContactDraft } from "./extract";

/**
 * Data access for the LINE bot. It runs with the service-role client (no
 * browser session, so no RLS), therefore every query here is explicitly
 * scoped to the owner.
 */
export interface BotCtx {
  supabase: SupabaseClient;
  ownerId: string;
  lineUserId: string;
  today: string;
}

export const CONTACT_CARD_COLUMNS =
  "id, name, company, title, role_type, phone, email, line_display_name, line_id, whatsapp_phone, wechat_id, birthday_month, birthday_day, notes, is_important";

/** Strips characters that have meaning inside a PostgREST `or=(...)` filter. */
function sanitizeTerm(term: string) {
  return term.replace(/[,()*%\\]/g, " ").trim();
}

export async function getContact(ctx: BotCtx, id: string): Promise<ContactForCard | null> {
  const { data, error } = await ctx.supabase
    .from("contacts")
    .select(CONTACT_CARD_COLUMNS)
    .eq("owner_id", ctx.ownerId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as ContactForCard | null;
}

export async function searchContacts(ctx: BotCtx, query: string, limit = 10): Promise<ContactForCard[]> {
  const term = sanitizeTerm(query);
  if (!term) return [];
  const pattern = `%${term}%`;
  const { data, error } = await ctx.supabase
    .from("contacts")
    .select(CONTACT_CARD_COLUMNS)
    .eq("owner_id", ctx.ownerId)
    .or(
      [
        `name.ilike.${pattern}`,
        `name_en.ilike.${pattern}`,
        `company.ilike.${pattern}`,
        `line_display_name.ilike.${pattern}`,
        `line_id.ilike.${pattern}`,
        `phone.ilike.${pattern}`,
        `notes.ilike.${pattern}`,
      ].join(","),
    )
    .order("name")
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as ContactForCard[];
  // Exact name matches first.
  return rows.sort((a, b) => Number(b.name === term) - Number(a.name === term));
}

export async function findContactByExactName(ctx: BotCtx, name: string): Promise<ContactForCard[]> {
  const term = sanitizeTerm(name);
  if (!term) return [];
  const { data, error } = await ctx.supabase
    .from("contacts")
    .select(CONTACT_CARD_COLUMNS)
    .eq("owner_id", ctx.ownerId)
    .or(`name.eq.${term},line_display_name.eq.${term},name_en.ilike.${term}`)
    .limit(5);
  if (error) throw error;
  return (data ?? []) as ContactForCard[];
}

export async function listContactNames(ctx: BotCtx): Promise<{ id: string; name: string }[]> {
  const { data, error } = await ctx.supabase.from("contacts").select("id, name").eq("owner_id", ctx.ownerId);
  if (error) throw error;
  return (data ?? []) as { id: string; name: string }[];
}

/** Contacts whose name appears in a sentence ("寄報價給王小明" → 王小明), longest first. */
export async function contactsMentionedIn(ctx: BotCtx, sentence: string) {
  const names = await listContactNames(ctx);
  return names
    .filter((c) => c.name.length >= 2 && sentence.includes(c.name))
    .sort((a, b) => b.name.length - a.name.length);
}

export async function recentContacts(ctx: BotCtx, limit = 10) {
  const { data, error, count } = await ctx.supabase
    .from("contacts")
    .select(CONTACT_CARD_COLUMNS, { count: "exact" })
    .eq("owner_id", ctx.ownerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return { contacts: (data ?? []) as ContactForCard[], total: count ?? 0 };
}

export function draftToRow(draft: ContactDraft): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(draft)) {
    if (value !== undefined && value !== "") row[key] = value;
  }
  return row;
}

export async function createContact(ctx: BotCtx, draft: ContactDraft): Promise<ContactForCard> {
  const { data, error } = await ctx.supabase
    .from("contacts")
    .insert({ ...draftToRow(draft), owner_id: ctx.ownerId, met_channel: "LINE 助理" })
    .select(CONTACT_CARD_COLUMNS)
    .single();
  if (error) throw error;
  return data as ContactForCard;
}

export async function updateContact(ctx: BotCtx, id: string, patch: Record<string, unknown>) {
  const { data, error } = await ctx.supabase
    .from("contacts")
    .update(patch)
    .eq("owner_id", ctx.ownerId)
    .eq("id", id)
    .select(CONTACT_CARD_COLUMNS)
    .single();
  if (error) throw error;
  return data as ContactForCard;
}

export async function deleteContact(ctx: BotCtx, id: string) {
  const { error } = await ctx.supabase.from("contacts").delete().eq("owner_id", ctx.ownerId).eq("id", id);
  if (error) throw error;
}

export async function appendNote(ctx: BotCtx, contact: ContactForCard, note: string) {
  const stamped = `[${ctx.today}] ${note}`;
  const notes = contact.notes ? `${contact.notes}\n${stamped}` : stamped;
  return updateContact(ctx, contact.id, { notes });
}

// ---------------------------------------------------------------------------
// Tasks / meetings / reminders
// ---------------------------------------------------------------------------

export interface BotTask {
  id: string;
  title: string;
  due_date: string | null;
  contact: { id: string; name: string } | null;
}

export async function listPendingTasks(ctx: BotCtx, opts: { dueOnOrBefore?: string; limit?: number } = {}) {
  let query = ctx.supabase
    .from("tasks")
    .select("id, title, due_date, contact:contacts(id, name)", { count: "exact" })
    .eq("owner_id", ctx.ownerId)
    .eq("status", "pending")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 10);
  if (opts.dueOnOrBefore) query = query.lte("due_date", opts.dueOnOrBefore);
  const { data, error, count } = await query;
  if (error) throw error;
  return { tasks: (data ?? []) as unknown as BotTask[], total: count ?? 0 };
}

export async function createTask(ctx: BotCtx, task: { title: string; due_date?: string; contact_id?: string }) {
  const { data, error } = await ctx.supabase
    .from("tasks")
    .insert({ owner_id: ctx.ownerId, title: task.title, due_date: task.due_date ?? null, contact_id: task.contact_id ?? null, source_type: "manual" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function setTaskStatus(ctx: BotCtx, id: string, status: TaskStatus) {
  const { data, error } = await ctx.supabase
    .from("tasks")
    .update({ status, completed_at: status === "pending" ? null : new Date().toISOString() })
    .eq("owner_id", ctx.ownerId)
    .eq("id", id)
    .select("title")
    .maybeSingle();
  if (error) throw error;
  return (data?.title as string | undefined) ?? null;
}

export async function createMeeting(
  ctx: BotCtx,
  meeting: { title: string; meeting_date: string; content: string; contactIds: string[] },
) {
  const { data, error } = await ctx.supabase
    .from("meetings")
    .insert({ owner_id: ctx.ownerId, title: meeting.title, meeting_date: meeting.meeting_date, content: meeting.content })
    .select("id")
    .single();
  if (error) throw error;
  if (meeting.contactIds.length > 0) {
    const { error: linkError } = await ctx.supabase
      .from("meeting_contacts")
      .insert(meeting.contactIds.map((contact_id) => ({ meeting_id: data.id, contact_id })));
    if (linkError) throw linkError;
  }
  return data.id as string;
}

export type ReminderContact = Pick<
  ContactForCard,
  "id" | "name" | "title" | "role_type" | "phone" | "whatsapp_phone" | "wechat_id" | "line_id"
> & { role_type: RoleType };

export interface BotReminder {
  id: string;
  reminder_type: ReminderType;
  festival_key: FestivalKey | null;
  occurrence_year: number | null;
  due_date: string;
  notes: string | null;
  contact: ReminderContact | null;
}

const REMINDER_COLUMNS =
  "id, reminder_type, festival_key, occurrence_year, due_date, notes, contact:contacts(id, name, title, role_type, phone, whatsapp_phone, wechat_id, line_id)";

export async function listPendingReminders(
  ctx: BotCtx,
  opts: { dueOnOrBefore: string; festivalKey?: FestivalKey; year?: number; limit?: number },
): Promise<BotReminder[]> {
  let query = ctx.supabase
    .from("reminders")
    .select(REMINDER_COLUMNS)
    .eq("owner_id", ctx.ownerId)
    .eq("status", "pending")
    .lte("due_date", opts.dueOnOrBefore)
    .order("due_date", { ascending: true })
    .limit(opts.limit ?? 200);
  if (opts.festivalKey) query = query.eq("festival_key", opts.festivalKey);
  if (opts.year) query = query.eq("occurrence_year", opts.year);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as BotReminder[];
}

export async function setReminderStatus(ctx: BotCtx, ids: string[], status: TaskStatus) {
  if (ids.length === 0) return;
  const { error } = await ctx.supabase
    .from("reminders")
    .update({ status, completed_at: status === "pending" ? null : new Date().toISOString() })
    .eq("owner_id", ctx.ownerId)
    .in("id", ids);
  if (error) throw error;
}

export async function upcomingBirthdays(ctx: BotCtx, days: number) {
  const { data, error } = await ctx.supabase
    .from("contacts")
    .select(CONTACT_CARD_COLUMNS)
    .eq("owner_id", ctx.ownerId)
    .not("birthday_month", "is", null)
    .not("birthday_day", "is", null);
  if (error) throw error;
  const year = Number(ctx.today.slice(0, 4));
  const todayMs = Date.parse(`${ctx.today}T00:00:00Z`);
  return ((data ?? []) as ContactForCard[])
    .map((contact) => {
      const pad = (n: number) => String(n).padStart(2, "0");
      let next = `${year}-${pad(contact.birthday_month!)}-${pad(contact.birthday_day!)}`;
      if (Date.parse(`${next}T00:00:00Z`) < todayMs) next = `${year + 1}-${pad(contact.birthday_month!)}-${pad(contact.birthday_day!)}`;
      const inDays = Math.round((Date.parse(`${next}T00:00:00Z`) - todayMs) / 86_400_000);
      return { contact, date: next, inDays };
    })
    .filter((b) => !Number.isNaN(b.inDays) && b.inDays <= days)
    .sort((a, b) => a.inDays - b.inDays);
}

// ---------------------------------------------------------------------------
// Conversation state
// ---------------------------------------------------------------------------

const SESSION_TTL_MS = 30 * 60 * 1000;

export async function loadSession<T>(ctx: BotCtx): Promise<T | null> {
  const { data, error } = await ctx.supabase
    .from("bot_sessions")
    .select("state, expires_at")
    .eq("owner_id", ctx.ownerId)
    .eq("line_user_id", ctx.lineUserId)
    .maybeSingle();
  if (error) throw error;
  if (!data || Date.parse(data.expires_at as string) < Date.now()) return null;
  const state = data.state as T & { flow?: string };
  return state && state.flow ? state : null;
}

export async function saveSession(ctx: BotCtx, state: object | null) {
  const { error } = await ctx.supabase.from("bot_sessions").upsert(
    {
      owner_id: ctx.ownerId,
      line_user_id: ctx.lineUserId,
      state: state ?? {},
      expires_at: new Date(Date.now() + (state ? SESSION_TTL_MS : 0)).toISOString(),
    },
    { onConflict: "line_user_id" },
  );
  if (error) throw error;
}
