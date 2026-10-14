import { NextResponse } from "next/server";

import { buildDigest } from "@/lib/bot/digest";
import type { BotCtx } from "@/lib/bot/data";
import { taipeiToday } from "@/lib/format-date";
import { pushMessage } from "@/lib/line/api";
import { isLineConfigured, lineConfig } from "@/lib/line/config";
import { generateReminders } from "@/lib/reminders/generate";
import { createAdminClient, getOwnerUserId, isAdminConfigured } from "@/lib/supabase/admin";

export const maxDuration = 60;

/**
 * Daily 09:00 (Asia/Taipei) push: birthdays coming up, festival greetings
 * due, other reminders, and today's tasks. Each reminder is pushed once per
 * stage (a few days early for birthdays, then on the day) — tracked in
 * notification_deliveries — and nothing is sent on a quiet day.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const { ownerUserId } = lineConfig();
  if (!isLineConfigured() || !ownerUserId || !isAdminConfigured()) {
    return NextResponse.json({ skipped: "LINE bot not configured" });
  }

  const supabase = createAdminClient();
  const ownerId = await getOwnerUserId();
  const today = taipeiToday();
  const ctx: BotCtx = { supabase, ownerId, lineUserId: ownerUserId, today };

  // Keep this year's and next year's festival/birthday reminders in place so
  // new contacts are covered without anyone pressing "產生提醒".
  const year = Number(today.slice(0, 4));
  await generateReminders([year, year + 1], { supabase, ownerId });

  const { data: delivered, error } = await supabase
    .from("notification_deliveries")
    .select("dedupe_key")
    .eq("owner_id", ownerId)
    .eq("channel", "line")
    .like("dedupe_key", "line:reminder:%");
  if (error) throw error;
  const skip = new Set((delivered ?? []).map((d) => d.dedupe_key as string));

  const digest = await buildDigest(ctx, { skipReminderIds: skip });
  if (!digest.hasContent || (digest.reminderKeys.length === 0 && !(await hasTasksDueToday(ctx)))) {
    return NextResponse.json({ pushed: false });
  }

  let pushError: string | null = null;
  try {
    await pushMessage(ownerUserId, digest.messages);
  } catch (e) {
    pushError = e instanceof Error ? e.message : String(e);
  }

  if (digest.reminderKeys.length > 0) {
    const { error: insertError } = await supabase.from("notification_deliveries").insert(
      digest.reminderKeys.map(({ id, key }) => ({
        owner_id: ownerId,
        reminder_id: id,
        channel: "line",
        status: pushError ? "failed" : "sent",
        sent_at: pushError ? null : new Date().toISOString(),
        error_message: pushError,
        dedupe_key: pushError ? `${key}:failed:${Date.now()}` : key,
      })),
    );
    if (insertError) throw insertError;
  }

  if (pushError) return NextResponse.json({ pushed: false, error: pushError }, { status: 502 });
  return NextResponse.json({ pushed: true, reminders: digest.reminderKeys.length });
}

/** Only tasks due exactly today trigger a push on their own; overdue ones ride along. */
async function hasTasksDueToday(ctx: BotCtx) {
  const { count, error } = await ctx.supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ctx.ownerId)
    .eq("status", "pending")
    .eq("due_date", ctx.today);
  if (error) throw error;
  return (count ?? 0) > 0;
}
