"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { TaskStatus } from "@/types/database";

export interface ActionState {
  error?: string;
}

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const quickAddTaskSchema = z.object({
  title: z.string().trim().min(1, "請輸入待辦內容").max(200),
  due_date: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  contact_id: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
});

export async function quickAddTask(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = quickAddTaskSchema.safeParse({
    title: formData.get("title"),
    due_date: formData.get("due_date"),
    contact_id: formData.get("contact_id"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "輸入資料不正確" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    title: parsed.data.title,
    due_date: parsed.data.due_date ?? null,
    contact_id: parsed.data.contact_id ?? null,
    source_type: "manual",
  });

  if (error) {
    return { error: "新增失敗，請稍後再試" };
  }

  revalidatePath("/reminders");
  revalidatePath("/");
  if (parsed.data.contact_id) {
    revalidatePath(`/contacts/${parsed.data.contact_id}`);
  }
  return {};
}

export async function setTaskStatus(taskId: string, status: TaskStatus) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({ status, completed_at: status === "pending" ? null : new Date().toISOString() })
    .eq("id", taskId);

  if (error) throw new Error("更新失敗，請稍後再試");

  revalidatePath("/reminders");
  revalidatePath("/");
  revalidatePath("/contacts/[id]", "page");
}

export async function deleteTask(taskId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) throw new Error("刪除失敗，請稍後再試");

  revalidatePath("/reminders");
  revalidatePath("/");
}
