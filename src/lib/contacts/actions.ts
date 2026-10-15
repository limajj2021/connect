"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { quickAddContactSchema } from "@/lib/contacts/schema";
import { buildContactPayload, parseContactFormData } from "@/lib/contacts/form";

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
