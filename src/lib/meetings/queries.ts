import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { MeetingRow } from "@/types/database";

export interface MeetingWithContacts extends MeetingRow {
  contacts: { id: string; name: string }[];
}

type MeetingJoinRow = MeetingRow & {
  meeting_contacts: { contacts: { id: string; name: string } | null }[] | null;
};

function mapMeeting(row: MeetingJoinRow): MeetingWithContacts {
  const { meeting_contacts, ...meeting } = row;
  return {
    ...meeting,
    contacts: (meeting_contacts ?? [])
      .map((mc) => mc.contacts)
      .filter((c): c is { id: string; name: string } => Boolean(c)),
  };
}

export interface MeetingFilters {
  q?: string;
  contactId?: string;
}

export async function listMeetings(filters: MeetingFilters = {}): Promise<MeetingWithContacts[]> {
  const supabase = await createClient();

  let query = supabase
    .from("meetings")
    .select("*, meeting_contacts(contacts(id, name))")
    .order("meeting_date", { ascending: false });

  if (filters.q) {
    const term = filters.q.trim();
    if (term) {
      query = query.or([`title.ilike.%${term}%`, `content.ilike.%${term}%`, `location.ilike.%${term}%`].join(","));
    }
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as MeetingJoinRow[];
  const mapped = rows.map(mapMeeting);

  if (filters.contactId) {
    return mapped.filter((m) => m.contacts.some((c) => c.id === filters.contactId));
  }
  return mapped;
}

export async function getMeeting(id: string): Promise<MeetingWithContacts | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meetings")
    .select("*, meeting_contacts(contacts(id, name))")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapMeeting(data as MeetingJoinRow);
}

export async function listMeetingsForContact(contactId: string): Promise<MeetingWithContacts[]> {
  return listMeetings({ contactId });
}
