"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { contactFormSchema, quickAddContactSchema } from "@/lib/contacts/schema";
import type { ContactFormValues } from "@/lib/contacts/schema";

export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function syncContactIndustries(contactId: string, industryNames: string[]) {
  const supabase = await createClient();
  const names = [...new Set(industryNames.map((n) => n.trim()).filter(Boolean))];

  if (names.length > 0) {
    const { error: upsertError } = await supabase
      .from("industries")
      .upsert(
        names.map((name) => ({ name })),
        { onConflict: "owner_id,name", ignoreDuplicates: true },
      );
    if (upsertError) throw upsertError;
  }

  const { error: deleteError } = await supabase
    .from("contact_industries")
    .delete()
    .eq("contact_id", contactId);
  if (deleteError) throw deleteError;

  if (names.length === 0) return;

  const { data: industryRows, error: fetchError } = await supabase
    .from("industries")
    .select("id, name")
    .in("name", names);
  if (fetchError) throw fetchError;

  const links = (industryRows ?? []).map((row) => ({ contact_id: contactId, industry_id: row.id }));
  if (links.length > 0) {
    const { error: linkError } = await supabase.from("contact_industries").insert(links);
    if (linkError) throw linkError;
  }
}

function buildContactPayload(values: ContactFormValues) {
  return {
    name: values.name,
    name_en: values.name_en ?? null,
    company: values.company ?? null,
    title: values.title ?? null,
    role_type: values.role_type,
    country: values.country ?? null,
    city: values.city ?? null,
    phone: values.phone ?? null,
    email: values.email ?? null,
    line_display_name: values.line_display_name ?? null,
    line_id: values.line_id ?? null,
    line_url: values.line_url ?? null,
    whatsapp_phone: values.whatsapp_phone ?? null,
    wechat_id: values.wechat_id ?? null,
    met_date: values.met_date ?? null,
    met_channel: values.met_channel ?? null,
    birthday_month: values.birthday_month ?? null,
    birthday_day: values.birthday_day ?? null,
    birthday_year: values.birthday_year ?? null,
    notes: values.notes ?? null,
    is_important: values.is_important,
    festival_reminder_enabled: values.festival_reminder_enabled,
  };
}

export async function quickAddContact(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = quickAddContactSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "輸入資料不正確" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .insert({ name: parsed.data.name })
    .select("id")
    .single();

  if (error) {
    return { error: "新增失敗，請稍後再試" };
  }

  revalidatePath("/contacts");
  redirect(`/contacts/${data.id}`);
}

function parseContactFormData(formData: FormData) {
  const industries = formData.getAll("industries").map(String);
  return contactFormSchema.safeParse({
    name: formData.get("name"),
    name_en: formData.get("name_en"),
    company: formData.get("company"),
    title: formData.get("title"),
    role_type: formData.get("role_type") || "unclassified",
    country: formData.get("country"),
    city: formData.get("city"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    line_display_name: formData.get("line_display_name"),
    line_id: formData.get("line_id"),
    line_url: formData.get("line_url"),
    whatsapp_phone: formData.get("whatsapp_phone"),
    wechat_id: formData.get("wechat_id"),
    met_date: formData.get("met_date"),
    met_channel: formData.get("met_channel"),
    birthday_month: formData.get("birthday_month"),
    birthday_day: formData.get("birthday_day"),
    birthday_year: formData.get("birthday_year"),
    notes: formData.get("notes"),
    is_important: formData.get("is_important") === "on",
    festival_reminder_enabled: formData.get("festival_reminder_enabled") === "on",
    industries,
  });
}

export async function updateContact(
  contactId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseContactFormData(formData);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message;
    }
    return { error: "請檢查欄位內容", fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update(buildContactPayload(parsed.data))
    .eq("id", contactId);

  if (error) {
    return { error: "儲存失敗，請稍後再試" };
  }

  await syncContactIndustries(contactId, parsed.data.industries);

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
  return {};
}

export async function deleteContact(contactId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("contacts").delete().eq("id", contactId);
  if (error) {
    throw new Error("刪除失敗，請稍後再試");
  }
  revalidatePath("/contacts");
  redirect("/contacts");
}
