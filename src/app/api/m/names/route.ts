import { NextResponse } from "next/server";
import { z } from "zod";

import { bearer, isOwnerIdToken } from "@/lib/mini/liff-auth";
import { createAdminClient, getOwnerUserId } from "@/lib/supabase/admin";

/** LIFF 設定 → 稱呼與名字: everyone's 中文名／英文名／稱呼／語氣, edited in bulk. */
async function requireOwner(request: Request) {
  if (!(await isOwnerIdToken(bearer(request)))) return null;
  return { supabase: createAdminClient(), ownerId: await getOwnerUserId() };
}

export async function GET(request: Request) {
  const ctx = await requireOwner(request);
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await ctx.supabase
    .from("contacts")
    .select("id, name, name_en, company, title, role_type, salutation, greeting_tone, is_important")
    .eq("owner_id", ctx.ownerId)
    .order("is_important", { ascending: false })
    .order("name");
  if (error) return NextResponse.json({ error: "load failed" }, { status: 500 });
  return NextResponse.json({ contacts: data ?? [] }, { headers: { "cache-control": "no-store" } });
}

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim() : v);
const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, "名字不能空白").max(100).optional(),
  name_en: z.preprocess(blankToNull, z.string().max(100).nullable()).optional(),
  salutation: z.preprocess(blankToNull, z.string().max(50).nullable()).optional(),
  greeting_tone: z.preprocess(blankToNull, z.enum(["formal", "casual"]).nullable()).optional(),
});
const patchSchema = z.object({ updates: z.array(updateSchema).min(1).max(500) });

export async function PATCH(request: Request) {
  const ctx = await requireOwner(request);
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "資料格式錯誤" }, { status: 400 });

  let updated = 0;
  for (const { id, ...patch } of parsed.data.updates) {
    if (Object.keys(patch).length === 0) continue;
    const { error } = await ctx.supabase.from("contacts").update(patch).eq("owner_id", ctx.ownerId).eq("id", id);
    if (error) return NextResponse.json({ error: "儲存失敗，請稍後再試", updated }, { status: 500 });
    updated++;
  }
  return NextResponse.json({ updated });
}
