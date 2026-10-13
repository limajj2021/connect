"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { meetingFormSchema } from "@/lib/meetings/schema";

export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

function parseMeetingFormData(formData: FormData) {
  const contact_ids = formData.getAll("contact_ids").map(String);
  return meetingFormSchema.safeParse({
    title: formData.get("title"),
    meeting_date: formData.get("meeting_date"),
    meeting_time: formData.get("meeting_time"),
    location: formData.get("location"),
    content: formData.get("content"),
    contact_ids,
    follow_up_title: formData.get("follow_up_title"),
    follow_up_due_date: formData.get("follow_up_due_date"),
  });
}

async function syncMeetingContacts(meetingId: string, contactIds: string[]) {
  const supabase = await createClient();
  const { error: deleteError } = await supabase.from("meeting_contacts").delete().eq("meeting_id", meetingId);
  if (deleteError) throw deleteError;

  if (contactIds.length === 0) return;

  const { error: insertError } = await supabase
    .from("meeting_contacts")
    .insert(contactIds.map((contact_id) => ({ meeting_id: meetingId, contact_id })));
  if (insertError) throw insertError;
}

async function createFollowUpTaskIfNeeded(
  meetingId: string,
  contactIds: string[],
  title?: string,
  dueDate?: string,
) {
  if (!title) return;
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    title,
    due_date: dueDate ?? null,
    contact_id: contactIds[0] ?? null,
    source_type: "meeting",
    source_meeting_id: meetingId,
  });
  if (error) throw error;
}

export async function createMeeting(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseMeetingFormData(formData);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return { error: "請檢查欄位內容", fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meetings")
    .insert({
      title: parsed.data.title,
      meeting_date: parsed.data.meeting_date,
      meeting_time: parsed.data.meeting_time ?? null,
      location: parsed.data.location ?? null,
      content: parsed.data.content ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return { error: "新增失敗，請稍後再試" };
  }

  await syncMeetingContacts(data.id, parsed.data.contact_ids);
  await createFollowUpTaskIfNeeded(
    data.id,
    parsed.data.contact_ids,
    parsed.data.follow_up_title,
    parsed.data.follow_up_due_date,
  );

  revalidatePath("/records");
  redirect(`/records/meetings/${data.id}`);
}

export async function updateMeeting(
  meetingId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseMeetingFormData(formData);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return { error: "請檢查欄位內容", fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("meetings")
    .update({
      title: parsed.data.title,
      meeting_date: parsed.data.meeting_date,
      meeting_time: parsed.data.meeting_time ?? null,
      location: parsed.data.location ?? null,
      content: parsed.data.content ?? null,
    })
    .eq("id", meetingId);

  if (error) {
    return { error: "儲存失敗，請稍後再試" };
  }

  await syncMeetingContacts(meetingId, parsed.data.contact_ids);
  await createFollowUpTaskIfNeeded(
    meetingId,
    parsed.data.contact_ids,
    parsed.data.follow_up_title,
    parsed.data.follow_up_due_date,
  );

  revalidatePath("/records");
  revalidatePath(`/records/meetings/${meetingId}`);
  return {};
}

export async function deleteMeeting(meetingId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("meetings").delete().eq("id", meetingId);
  if (error) throw new Error("刪除失敗，請稍後再試");
  revalidatePath("/records");
  redirect("/records");
}
