"use server";

import { revalidatePath } from "next/cache";

import { clearShots, createBatch, loadBatch } from "@/lib/bot/batch";
import { parseContactFormData } from "@/lib/contacts/form";
import { setContactTags } from "@/lib/mini/tags";
import { verifyScope } from "@/lib/mini/token";
import { createAdminClient, getOwnerUserId } from "@/lib/supabase/admin";

export interface MiniState {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  name?: string;
  deleted?: boolean;
}

// The mini-form only shows these; everything else on the contact is left as is.
const MINI_FIELDS = [
  "name",
  "company",
  "title",
  "role_type",
  "phone",
  "email",
  "line_display_name",
  "line_id",
  "whatsapp_phone",
  "wechat_id",
  "birthday_month",
  "birthday_day",
  "birthday_year",
  "notes",
  "is_important",
  "festival_reminder_enabled",
] as const;

function refreshWeb(contactId?: string) {
  revalidatePath("/contacts");
  revalidatePath("/");
  if (contactId) revalidatePath(`/contacts/${contactId}`);
}

export async function saveMiniContact(token: string, contactId: string | null, _prev: MiniState, formData: FormData): Promise<MiniState> {
  if (!verifyScope(token, contactId ? `contact:${contactId}` : "contact:new")) {
    return { error: "連結已失效，請回 LINE 重新開啟" };
  }
  const parsed = parseContactFormData(formData);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return { error: "請檢查標紅色的欄位", fieldErrors };
  }

  const patch: Record<string, unknown> = {};
  for (const field of MINI_FIELDS) {
    const value = parsed.data[field];
    patch[field] = value === undefined ? null : value;
  }

  const supabase = createAdminClient();
  const ownerId = await getOwnerUserId();
  if (contactId) {
    const { data, error } = await supabase
      .from("contacts")
      .update(patch)
      .eq("owner_id", ownerId)
      .eq("id", contactId)
      .select("name")
      .maybeSingle();
    if (error || !data) return { error: "儲存失敗，請稍後再試" };
    await setContactTags(supabase, ownerId, contactId, parsed.data.industries);
    refreshWeb(contactId);
    return { ok: true, name: data.name as string };
  }
  const { data, error } = await supabase
    .from("contacts")
    .insert({ ...patch, owner_id: ownerId, met_channel: "LINE 助理" })
    .select("id, name")
    .single();
  if (error) return { error: "新增失敗，請稍後再試" };
  await setContactTags(supabase, ownerId, data.id as string, parsed.data.industries);
  refreshWeb(data.id as string);
  return { ok: true, name: data.name as string };
}

export async function deleteMiniContact(token: string, contactId: string): Promise<MiniState> {
  if (!verifyScope(token, `contact:${contactId}`)) return { error: "連結已失效，請回 LINE 重新開啟" };
  const supabase = createAdminClient();
  const { error } = await supabase.from("contacts").delete().eq("owner_id", await getOwnerUserId()).eq("id", contactId);
  if (error) return { error: "刪除失敗，請稍後再試" };
  refreshWeb();
  return { ok: true, deleted: true };
}

export async function saveMiniTask(token: string, _prev: MiniState, formData: FormData): Promise<MiniState> {
  if (!verifyScope(token, "task:new")) return { error: "連結已失效，請回 LINE 重新開啟" };
  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  if (!title) return { error: "請輸入待辦內容", fieldErrors: { title: "請輸入待辦內容" } };
  const due = String(formData.get("due_date") ?? "").trim();
  const contactId = String(formData.get("contact_id") ?? "").trim();

  const supabase = createAdminClient();
  const ownerId = await getOwnerUserId();
  if (contactId) {
    // Only link to one of the owner's own contacts.
    const { data } = await supabase.from("contacts").select("id").eq("owner_id", ownerId).eq("id", contactId).maybeSingle();
    if (!data) return { error: "找不到這位人脈" };
  }
  const { error } = await supabase.from("tasks").insert({
    owner_id: ownerId,
    title,
    due_date: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null,
    contact_id: contactId || null,
    source_type: "manual",
  });
  if (error) return { error: "新增失敗，請稍後再試" };
  revalidatePath("/reminders");
  refreshWeb(contactId || undefined);
  return { ok: true, name: title };
}

/** /m/batch: create the people picked from list screenshots (names as edited). */
export async function saveMiniBatch(token: string, _prev: MiniState, formData: FormData): Promise<MiniState> {
  if (!verifyScope(token, "batch")) return { error: "連結已失效，請回 LINE 重新開啟" };
  const lineUserId = process.env.LINE_OWNER_USER_ID;
  if (!lineUserId) return { error: "LINE 尚未設定" };
  const ctx = { supabase: createAdminClient(), ownerId: await getOwnerUserId(), lineUserId };

  const picked = new Set(formData.getAll("pick").map(String));
  const entries = (await loadBatch(ctx)).filter((e) => picked.has(e.key));
  if (entries.length === 0) return { error: "請至少勾選一位（或這批已處理完）" };
  const drafts = entries.map((e) => {
    const name = String(formData.get(`name:${e.key}`) ?? "").trim().slice(0, 100);
    return { ...e.draft, name: name || e.draft.name };
  });
  if (drafts.some((d) => !d.name)) return { error: "每位都需要名字" };

  const tags = formData.getAll("industries").map(String);
  const created = await createBatch(ctx, drafts, tags);
  await clearShots(ctx);
  refreshWeb();
  return { ok: true, name: String(created.length) };
}
