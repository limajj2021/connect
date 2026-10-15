import "server-only";

import type { ContactForCard } from "@/lib/line/flex";

import { type BotCtx, CONTACT_CARD_COLUMNS } from "./data";
import { daysBetween } from "./dates";

/** An important (★) contact you haven't talked to in this many days gets a nudge. */
export const KEEP_IN_TOUCH_DAYS = 45;
/** The same person is nudged again at most this often. */
export const KEEP_IN_TOUCH_RENUDGE_DAYS = 14;
/** "Recently in touch" for the 今日 progress bar. */
export const RECENT_DAYS = 30;

export interface ImportantContact {
  contact: ContactForCard;
  /** Last day you talked to or greeted them (or when they were added, if never). */
  lastContactOn: string;
  hasHistory: boolean;
  daysSince: number;
}

/**
 * Every ★ contact with the last day you were in touch — a logged 交流, an AI
 * 溝通節點 from an imported chat, or a confirmed greeting. (Their own posts
 * don't count: seeing someone's post isn't talking to them.)
 */
export async function importantContacts(ctx: BotCtx): Promise<ImportantContact[]> {
  const { data, error } = await ctx.supabase
    .from("contacts")
    .select(`${CONTACT_CARD_COLUMNS}, created_at`)
    .eq("owner_id", ctx.ownerId)
    .eq("is_important", true);
  if (error) throw error;
  const contacts = (data ?? []) as (ContactForCard & { created_at: string })[];
  if (contacts.length === 0) return [];

  const { data: touches, error: touchError } = await ctx.supabase
    .from("contact_interactions")
    .select("contact_id, occurred_on")
    .eq("owner_id", ctx.ownerId)
    .in("kind", ["chat", "sent"])
    .in("contact_id", contacts.map((c) => c.id))
    .order("occurred_on", { ascending: false })
    .limit(2000);
  if (touchError) throw touchError;
  const last = new Map<string, string>();
  for (const row of touches ?? []) if (!last.has(row.contact_id as string)) last.set(row.contact_id as string, row.occurred_on as string);

  return contacts.map((contact) => {
    const touched = last.get(contact.id);
    const lastContactOn = touched ?? contact.created_at.slice(0, 10);
    return { contact, lastContactOn, hasHistory: Boolean(touched), daysSince: daysBetween(lastContactOn, ctx.today) };
  });
}

/** The ★ contacts gone quiet the longest, most overdue first. */
export function overdue(list: ImportantContact[]): ImportantContact[] {
  return list.filter((c) => c.daysSince >= KEEP_IN_TOUCH_DAYS).sort((a, b) => b.daysSince - a.daysSince);
}

/** Changes every KEEP_IN_TOUCH_RENUDGE_DAYS — the daily push's dedupe key for a nudge. */
export function keepInTouchKey(contactId: string, today: string): string {
  const period = Math.floor(Date.parse(`${today}T00:00:00Z`) / 86_400_000 / KEEP_IN_TOUCH_RENUDGE_DAYS);
  return `line:keep:${contactId}:${period}`;
}
