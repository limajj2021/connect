import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ChatExtractionRow } from "@/types/database";

interface ExtractionPayload {
  title: string;
  description?: string;
  relatedContactName?: string | null;
  companyName?: string | null;
  jobTitle?: string | null;
  lineName?: string | null;
  assignee?: string | null;
  dueDate?: string | null;
  isCompleted?: boolean;
  eventDate?: string | null;
}

async function resolveOrCreateContact(
  name: string | null | undefined,
  extra?: { company?: string | null; title?: string | null; lineDisplayName?: string | null },
): Promise<string | null> {
  if (!name?.trim()) return null;
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("contacts")
    .select("id, company, title, line_display_name")
    .ilike("name", name.trim())
    .maybeSingle();

  if (existing) {
    // Only fill fields the contact doesn't already have — approving an AI
    // suggestion should never silently overwrite data the user already entered.
    const patch: Record<string, unknown> = {};
    if (!existing.company && extra?.company) patch.company = extra.company;
    if (!existing.title && extra?.title) patch.title = extra.title;
    if (!existing.line_display_name && extra?.lineDisplayName) patch.line_display_name = extra.lineDisplayName;
    if (Object.keys(patch).length > 0) {
      await supabase.from("contacts").update(patch).eq("id", existing.id);
    }
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from("contacts")
    .insert({
      name: name.trim(),
      company: extra?.company ?? null,
      title: extra?.title ?? null,
      line_display_name: extra?.lineDisplayName ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

async function appendContactNote(contactId: string, note: string) {
  const supabase = await createClient();
  const { data: contact } = await supabase.from("contacts").select("notes").eq("id", contactId).maybeSingle();
  const nextNotes = contact?.notes ? `${contact.notes}\n\n${note}` : note;
  await supabase.from("contacts").update({ notes: nextNotes }).eq("id", contactId);
}

/**
 * Writes an approved (or edited-then-approved) extraction into the structured
 * CRM data: a person/company item updates or creates a contact, a topic/fact/
 * date_event appends a note to the related contact, and a todo becomes a task.
 * Never called for rejected items, and never overwrites a contact field that
 * already has a value.
 */
export async function applyExtraction(extraction: ChatExtractionRow): Promise<void> {
  const payload = extraction.payload as unknown as ExtractionPayload;
  const supabase = await createClient();

  switch (extraction.extraction_type) {
    case "person": {
      await resolveOrCreateContact(payload.relatedContactName ?? payload.title, {
        company: payload.companyName,
        title: payload.jobTitle,
        lineDisplayName: payload.lineName,
      });
      return;
    }
    case "company": {
      if (payload.relatedContactName) {
        await resolveOrCreateContact(payload.relatedContactName, { company: payload.title });
      }
      return;
    }
    case "topic":
    case "fact":
    case "date_event": {
      if (!payload.relatedContactName) return;
      const contactId = await resolveOrCreateContact(payload.relatedContactName);
      if (!contactId) return;
      const dateSuffix = payload.eventDate ? `（日期：${payload.eventDate}）` : "";
      const note = `[AI 擷取] ${payload.title}${dateSuffix}${payload.description ? `\n${payload.description}` : ""}`;
      await appendContactNote(contactId, note);
      return;
    }
    case "todo": {
      const contactId = await resolveOrCreateContact(payload.assignee ?? payload.relatedContactName);
      const { error } = await supabase.from("tasks").insert({
        title: payload.title,
        description: payload.description ?? null,
        due_date: payload.dueDate ?? null,
        contact_id: contactId,
        source_type: "chat_extraction",
        source_extraction_id: extraction.id,
        status: payload.isCompleted ? "completed" : "pending",
      });
      if (error) throw error;
      return;
    }
  }
}
