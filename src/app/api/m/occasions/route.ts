import { NextResponse } from "next/server";
import { z } from "zod";

import { bearer, isOwnerIdToken } from "@/lib/mini/liff-auth";
import { createOccasion, deleteOccasion, listOccasions, updateOccasion } from "@/lib/reminders/occasions";
import { createAdminClient, getOwnerUserId } from "@/lib/supabase/admin";

/**
 * Owner-editable greeting occasions for the LIFF "節日" page (rich menu).
 * Authenticated the same way as the contact directory: the owner's LIFF ID
 * token, no signed scoped link (the rich menu button is a static URL).
 */
async function requireOwner(request: Request) {
  if (!(await isOwnerIdToken(bearer(request)))) return null;
  return { supabase: createAdminClient(), ownerId: await getOwnerUserId() };
}

export async function GET(request: Request) {
  const ctx = await requireOwner(request);
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const occasions = await listOccasions(ctx);
  return NextResponse.json({ occasions }, { headers: { "cache-control": "no-store" } });
}

const inputSchema = z.object({
  name: z.string().trim().min(1).max(50),
  calendar: z.enum(["lunar", "solar"]),
  month: z.coerce.number().int().min(1).max(12),
  day: z.coerce.number().int().min(1).max(31),
  lead_days: z.coerce.number().int().min(0).max(60).default(7),
});

export async function POST(request: Request) {
  const ctx = await requireOwner(request);
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "資料格式錯誤" }, { status: 400 });
  try {
    const occasion = await createOccasion(ctx, parsed.data);
    return NextResponse.json({ occasion });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("duplicate") ? "已經有同名的節日" : "新增失敗";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

const patchSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(50).optional(),
  calendar: z.enum(["lunar", "solar"]).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  day: z.coerce.number().int().min(1).max(31).optional(),
  lead_days: z.coerce.number().int().min(0).max(60).optional(),
  enabled: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const ctx = await requireOwner(request);
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "資料格式錯誤" }, { status: 400 });
  const { id, ...patch } = parsed.data;
  const occasion = await updateOccasion(ctx, id, patch);
  if (!occasion) return NextResponse.json({ error: "找不到這個節日" }, { status: 404 });
  return NextResponse.json({ occasion });
}

export async function DELETE(request: Request) {
  const ctx = await requireOwner(request);
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  await deleteOccasion(ctx, id);
  return NextResponse.json({ ok: true });
}
