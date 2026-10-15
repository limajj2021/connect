import { NextResponse } from "next/server";
import { z } from "zod";

import { listContactFestivalSettings, setFestivalReminderEnabled } from "@/lib/contacts/festival-settings";
import { bearer, isOwnerIdToken } from "@/lib/mini/liff-auth";
import { createAdminClient, getOwnerUserId } from "@/lib/supabase/admin";

/** Bulk on/off for contacts.festival_reminder_enabled — LIFF "節慶提醒" settings page. */
async function requireOwner(request: Request) {
  if (!(await isOwnerIdToken(bearer(request)))) return null;
  return { supabase: createAdminClient(), ownerId: await getOwnerUserId() };
}

export async function GET(request: Request) {
  const ctx = await requireOwner(request);
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const contacts = await listContactFestivalSettings(ctx);
  return NextResponse.json({ contacts }, { headers: { "cache-control": "no-store" } });
}

const patchSchema = z.object({ ids: z.array(z.string().uuid()).min(1), enabled: z.boolean() });

export async function PATCH(request: Request) {
  const ctx = await requireOwner(request);
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "資料格式錯誤" }, { status: 400 });
  const updated = await setFestivalReminderEnabled(ctx, parsed.data.ids, parsed.data.enabled);
  return NextResponse.json({ updated });
}
