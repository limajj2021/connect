import { NextResponse } from "next/server";

import { missingFields, type ContactForCard } from "@/lib/line/flex";
import { bearer, isOwnerIdToken } from "@/lib/mini/liff-auth";
import { signScope } from "@/lib/mini/token";
import { createAdminClient, getOwnerUserId } from "@/lib/supabase/admin";

/**
 * Contact directory for the LIFF list (rich menu → 人脈). Authenticated with
 * the owner's LIFF ID token; each row carries a signed link to its edit form.
 */
export async function GET(request: Request) {
  if (!(await isOwnerIdToken(bearer(request)))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const ownerId = await getOwnerUserId();
  const { data, error } = await supabase
    .from("contacts")
    .select(
      "id, name, company, title, role_type, phone, email, line_display_name, line_id, whatsapp_phone, wechat_id, linkedin_url, facebook_url, birthday_month, birthday_day, notes, is_important, contact_industries(industries(name))",
    )
    .eq("owner_id", ownerId)
    .order("name");
  if (error) return NextResponse.json({ error: "load failed" }, { status: 500 });

  // Newest first, so the first row seen per contact is their latest.
  const { data: touches } = await supabase
    .from("contact_interactions")
    .select("contact_id, occurred_on, content, kind")
    .eq("owner_id", ownerId)
    .in("kind", ["chat", "sent"])
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5000);
  const lastContactOn = new Map<string, string>();
  const lastTouch = new Map<string, { occurred_on: string; content: string }>();
  for (const row of touches ?? []) {
    const id = row.contact_id as string;
    if (!lastContactOn.has(id)) lastContactOn.set(id, row.occurred_on as string);
    if (row.kind === "chat" && !lastTouch.has(id)) lastTouch.set(id, { occurred_on: row.occurred_on as string, content: row.content as string });
  }

  const contacts = (data ?? []).map((row) => {
    const tags = ((row.contact_industries ?? []) as unknown as { industries: { name: string } | null }[])
      .map((ci) => ci.industries?.name)
      .filter((n): n is string => Boolean(n));
    return {
      id: row.id as string,
      name: row.name as string,
      company: row.company as string | null,
      title: row.title as string | null,
      role_type: row.role_type as string,
      is_important: row.is_important as boolean,
      tags,
      missing: missingFields(row as unknown as ContactForCard).length,
      lastTouch: lastTouch.get(row.id as string) ?? null,
      lastContactOn: lastContactOn.get(row.id as string) ?? null,
      editUrl: `/m/contacts/${row.id}?back=list&t=${signScope(`contact:${row.id}`, 24 * 60 * 60)}`,
    };
  });

  return NextResponse.json(
    { contacts, newUrl: `/m/contacts/new?back=list&t=${signScope("contact:new", 24 * 60 * 60)}` },
    { headers: { "cache-control": "no-store" } },
  );
}
