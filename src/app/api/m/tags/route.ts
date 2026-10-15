import { NextResponse } from "next/server";
import { z } from "zod";

import { bearer, isOwnerIdToken } from "@/lib/mini/liff-auth";
import { createAdminClient, getOwnerUserId } from "@/lib/supabase/admin";
import { deleteTag, listTagsWithCounts, mergeTags, renameTag } from "@/lib/tags/manage";

/** Tag (industry) management for the LIFF "標籤管理" page (rich menu → 設定). */
async function requireOwner(request: Request) {
  if (!(await isOwnerIdToken(bearer(request)))) return null;
  return { supabase: createAdminClient(), ownerId: await getOwnerUserId() };
}

export async function GET(request: Request) {
  const ctx = await requireOwner(request);
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const tags = await listTagsWithCounts(ctx);
  return NextResponse.json({ tags }, { headers: { "cache-control": "no-store" } });
}

const renameSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(50) });

export async function PATCH(request: Request) {
  const ctx = await requireOwner(request);
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = renameSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "資料格式錯誤" }, { status: 400 });
  try {
    const tag = await renameTag(ctx, parsed.data.id, parsed.data.name);
    return NextResponse.json({ tag });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("duplicate") ? "已經有同名的標籤" : "改名失敗";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

const mergeSchema = z.object({ sourceIds: z.array(z.string().uuid()).min(1), targetName: z.string().trim().min(1).max(50) });

export async function POST(request: Request) {
  const ctx = await requireOwner(request);
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = mergeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "資料格式錯誤" }, { status: 400 });
  try {
    const tag = await mergeTags(ctx, parsed.data.sourceIds, parsed.data.targetName);
    return NextResponse.json({ tag });
  } catch {
    return NextResponse.json({ error: "合併失敗" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const ctx = await requireOwner(request);
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  await deleteTag(ctx, id);
  return NextResponse.json({ ok: true });
}
