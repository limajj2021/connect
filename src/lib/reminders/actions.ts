"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { TaskStatus } from "@/types/database";

import { generateReminders } from "./generate";

export interface ActionState {
  error?: string;
  message?: string;
}

export async function runGenerateReminders(_prev: ActionState): Promise<ActionState> {
  const currentYear = new Date().getFullYear();
  try {
    const summary = await generateReminders([currentYear, currentYear + 1]);
    revalidatePath("/reminders");
    revalidatePath("/");
    return {
      message: `已產生 ${summary.festivalsCreated} 筆節日提醒、${summary.birthdaysCreated} 筆生日提醒（${currentYear}–${currentYear + 1}）`,
    };
  } catch {
    return { error: "產生提醒失敗，請稍後再試" };
  }
}

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const customReminderSchema = z.object({
  contact_id: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  due_date: z.string().trim().min(1, "請選擇日期"),
  notes: z.string().trim().min(1, "請輸入提醒內容").max(500),
});

export async function createCustomReminder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = customReminderSchema.safeParse({
    contact_id: formData.get("contact_id"),
    due_date: formData.get("due_date"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "輸入資料不正確" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("reminders").insert({
    contact_id: parsed.data.contact_id ?? null,
    reminder_type: "custom",
    due_date: parsed.data.due_date,
    notes: parsed.data.notes,
  });

  if (error) {
    return { error: "新增失敗，請稍後再試" };
  }

  revalidatePath("/reminders");
  revalidatePath("/");
  return {};
}

export async function setReminderStatus(reminderId: string, status: TaskStatus) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("reminders")
    .update({ status, completed_at: status === "pending" ? null : new Date().toISOString() })
    .eq("id", reminderId);

  if (error) throw new Error("更新失敗，請稍後再試");

  revalidatePath("/reminders");
  revalidatePath("/");
}

export async function deleteReminder(reminderId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("reminders").delete().eq("id", reminderId);
  if (error) throw new Error("刪除失敗，請稍後再試");

  revalidatePath("/reminders");
  revalidatePath("/");
}
