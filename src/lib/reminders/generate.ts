import "server-only";

import { createClient } from "@/lib/supabase/server";

import { ALL_FESTIVAL_KEYS, getFestivalReminderDueDate } from "./taiwan-holidays";

export interface GenerateSummary {
  festivalsCreated: number;
  birthdaysCreated: number;
}

/**
 * Creates festival and birthday reminders for the given solar years, skipping
 * any (contact, year[, festival]) combination that already has a reminder row.
 * Safe to re-run — existing reminders (including ones the user already marked
 * completed/skipped) are left untouched.
 */
export async function generateReminders(years: number[]): Promise<GenerateSummary> {
  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("reminders")
    .select("contact_id, reminder_type, festival_key, occurrence_year")
    .in("occurrence_year", years)
    .in("reminder_type", ["festival", "birthday"]);
  if (existingError) throw existingError;

  const existingKeys = new Set(
    (existing ?? []).map((r) => `${r.contact_id}|${r.reminder_type}|${r.festival_key ?? ""}|${r.occurrence_year}`),
  );

  const { data: festivalContacts, error: festivalContactsError } = await supabase
    .from("contacts")
    .select("id")
    .eq("festival_reminder_enabled", true);
  if (festivalContactsError) throw festivalContactsError;

  const festivalRows: Record<string, unknown>[] = [];
  for (const year of years) {
    for (const festival of ALL_FESTIVAL_KEYS) {
      const { dueDate } = getFestivalReminderDueDate(festival, year);
      for (const contact of festivalContacts ?? []) {
        const key = `${contact.id}|festival|${festival}|${year}`;
        if (existingKeys.has(key)) continue;
        festivalRows.push({
          contact_id: contact.id,
          reminder_type: "festival",
          festival_key: festival,
          occurrence_year: year,
          due_date: dueDate,
        });
      }
    }
  }

  if (festivalRows.length > 0) {
    const { error } = await supabase.from("reminders").insert(festivalRows);
    if (error) throw error;
  }

  const { data: birthdayContacts, error: birthdayContactsError } = await supabase
    .from("contacts")
    .select("id, birthday_month, birthday_day")
    .not("birthday_month", "is", null)
    .not("birthday_day", "is", null);
  if (birthdayContactsError) throw birthdayContactsError;

  const birthdayRows: Record<string, unknown>[] = [];
  for (const year of years) {
    for (const contact of birthdayContacts ?? []) {
      const key = `${contact.id}|birthday||${year}`;
      if (existingKeys.has(key)) continue;
      const month = String(contact.birthday_month).padStart(2, "0");
      const day = String(contact.birthday_day).padStart(2, "0");
      birthdayRows.push({
        contact_id: contact.id,
        reminder_type: "birthday",
        occurrence_year: year,
        due_date: `${year}-${month}-${day}`,
      });
    }
  }

  if (birthdayRows.length > 0) {
    const { error } = await supabase.from("reminders").insert(birthdayRows);
    if (error) throw error;
  }

  return { festivalsCreated: festivalRows.length, birthdaysCreated: birthdayRows.length };
}
