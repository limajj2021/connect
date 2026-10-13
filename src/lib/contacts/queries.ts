import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ContactRow } from "@/types/database";

export interface ContactFilters {
  q?: string;
  roleType?: "boss" | "non_boss" | "unclassified";
  importantOnly?: boolean;
  industry?: string;
  location?: string;
}

export interface ContactWithIndustries extends ContactRow {
  industries: string[];
}

export async function listContacts(filters: ContactFilters = {}): Promise<ContactWithIndustries[]> {
  const supabase = await createClient();

  let query = supabase
    .from("contacts")
    .select("*, contact_industries(industries(name))")
    .order("name", { ascending: true });

  if (filters.roleType) {
    query = query.eq("role_type", filters.roleType);
  }
  if (filters.importantOnly) {
    query = query.eq("is_important", true);
  }
  if (filters.q) {
    const term = filters.q.trim();
    if (term) {
      query = query.or(
        [
          `name.ilike.%${term}%`,
          `name_en.ilike.%${term}%`,
          `company.ilike.%${term}%`,
          `line_display_name.ilike.%${term}%`,
          `notes.ilike.%${term}%`,
        ].join(","),
      );
    }
  }
  if (filters.location) {
    const term = filters.location.trim();
    if (term) {
      query = query.or([`city.ilike.%${term}%`, `country.ilike.%${term}%`].join(","));
    }
  }

  const { data, error } = await query;
  if (error) throw error;

  type Row = ContactRow & { contact_industries: { industries: { name: string } | null }[] | null };

  const rows = (data ?? []) as Row[];

  const mapped = rows.map((row) => {
    const { contact_industries, ...contact } = row;
    return {
      ...contact,
      industries: (contact_industries ?? [])
        .map((ci) => ci.industries?.name)
        .filter((name): name is string => Boolean(name)),
    };
  });

  if (filters.industry) {
    return mapped.filter((c) => c.industries.includes(filters.industry!));
  }

  return mapped;
}

export async function getContact(id: string): Promise<ContactWithIndustries | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("*, contact_industries(industries(name))")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  type Row = ContactRow & { contact_industries: { industries: { name: string } | null }[] | null };
  const row = data as Row;
  const { contact_industries, ...contact } = row;

  return {
    ...contact,
    industries: (contact_industries ?? [])
      .map((ci) => ci.industries?.name)
      .filter((name): name is string => Boolean(name)),
  };
}

export async function listIndustryNames(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("industries").select("name").order("name");
  if (error) throw error;
  return (data ?? []).map((row) => row.name);
}

export async function findPotentialDuplicates(name: string, excludeId?: string): Promise<ContactRow[]> {
  const trimmed = name.trim();
  if (!trimmed) return [];

  const supabase = await createClient();
  let query = supabase.from("contacts").select("*").ilike("name", trimmed);
  if (excludeId) {
    query = query.neq("id", excludeId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ContactRow[];
}
