import { NextResponse } from "next/server";

import { isLineConfigured } from "@/lib/line/config";
import { MENU_PREFIX, defaultRichMenuName, installRichMenus } from "@/lib/line/rich-menu";
import { bearer, isOwnerIdToken } from "@/lib/mini/liff-auth";
import { createAdminClient, getOwnerUserId } from "@/lib/supabase/admin";

/**
 * LIFF 設定 → 系統狀態: is the latest database migration in place, and is
 * the current rich menu installed? POST (re)installs the rich menu with the
 * app's own channel token. Owner-only (LIFF ID token).
 */
export const maxDuration = 60;

async function migrationApplied(): Promise<boolean> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("contact_interactions")
    .select("kind, source_url, chat_import_id")
    .eq("owner_id", await getOwnerUserId())
    .limit(1);
  return !error;
}

export async function GET(request: Request) {
  if (!(await isOwnerIdToken(bearer(request)))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [migration, menuName] = await Promise.all([migrationApplied(), isLineConfigured() ? defaultRichMenuName() : Promise.resolve("")]);
  return NextResponse.json(
    { migration, richMenu: menuName.startsWith(MENU_PREFIX) ? "current" : menuName ? "old" : "none" },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!(await isOwnerIdToken(bearer(request)))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isLineConfigured()) return NextResponse.json({ error: "LINE 尚未設定" }, { status: 503 });
  try {
    const result = await installRichMenus();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[rich-menu] install failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "更新失敗" }, { status: 502 });
  }
}
