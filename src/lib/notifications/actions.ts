"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { sendReminderEmail } from "./email";
import type { ReminderWithContact } from "@/lib/reminders/queries";

export interface ActionState {
  error?: string;
  message?: string;
}

/** Sends email notifications for pending reminders due today or earlier. */
export async function sendDueReminderEmails(_prev: ActionState): Promise<ActionState> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("reminders")
    .select("*, contact:contacts(id, name)")
    .eq("status", "pending")
    .lte("due_date", today);

  if (error) {
    return { error: "讀取提醒失敗" };
  }

  const reminders = (data ?? []) as ReminderWithContact[];
  if (reminders.length === 0) {
    return { message: "目前沒有到期的提醒需要寄送" };
  }

  let sent = 0;
  let skipped = 0;
  let configError: string | undefined;

  for (const reminder of reminders) {
    const result = await sendReminderEmail(reminder);
    if (result.sent) {
      sent += 1;
    } else {
      skipped += 1;
      if (result.reason?.startsWith("尚未設定")) configError = result.reason;
    }
  }

  revalidatePath("/reminders");

  if (configError) {
    return { error: `${configError}（已略過 ${reminders.length} 筆）` };
  }
  return { message: `已寄送 ${sent} 封通知，略過 ${skipped} 筆（已寄送過或失敗）` };
}
