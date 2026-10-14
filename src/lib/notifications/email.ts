import "server-only";

import { Resend } from "resend";

import { createClient } from "@/lib/supabase/server";
import { reminderTitle } from "@/lib/reminders/labels";
import type { ReminderWithContact } from "@/lib/reminders/queries";

export interface EmailSendResult {
  sent: boolean;
  reason?: string;
}

/**
 * Sends one reminder-due notification email. Returns `{ sent: false, reason }`
 * instead of throwing when email isn't configured, so callers can report a
 * clear status without the whole batch failing.
 */
export async function sendReminderEmail(reminder: ReminderWithContact): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATION_FROM_EMAIL;
  const ownerEmail = process.env.OWNER_EMAIL;

  if (!apiKey || !from || !ownerEmail) {
    return { sent: false, reason: "尚未設定 RESEND_API_KEY / NOTIFICATION_FROM_EMAIL / OWNER_EMAIL" };
  }

  const dedupeKey = `reminder:${reminder.id}`;
  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("notification_deliveries")
    .select("id")
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    return { sent: false, reason: "此提醒已寄送過通知" };
  }

  const title = reminderTitle(reminder);
  const contactName = reminder.contact?.name ?? "（未指定人脈）";
  const subject = `[Personal CRM] ${title}：${contactName}`;
  const html = `
    <p><strong>${title}</strong></p>
    <p>聯絡人：${contactName}</p>
    <p>到期日：${reminder.due_date}</p>
    ${reminder.notes ? `<p>備註：${reminder.notes}</p>` : ""}
  `;

  const resend = new Resend(apiKey);
  const { error: sendError } = await resend.emails.send({ from, to: ownerEmail, subject, html });

  await supabase.from("notification_deliveries").insert({
    reminder_id: reminder.id,
    channel: "email",
    status: sendError ? "failed" : "sent",
    sent_at: sendError ? null : new Date().toISOString(),
    error_message: sendError ? String(sendError.message ?? sendError) : null,
    dedupe_key: dedupeKey,
  });

  if (sendError) {
    return { sent: false, reason: sendError.message ?? "寄送失敗" };
  }
  return { sent: true };
}
