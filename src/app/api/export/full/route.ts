import JSZip from "jszip";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const TABLES = [
  "contacts",
  "industries",
  "contact_industries",
  "meetings",
  "meeting_contacts",
  "tasks",
  "reminders",
  "chat_imports",
  "chat_participants",
  "chat_messages",
  "chat_analysis_runs",
  "chat_extractions",
  "notification_deliveries",
  "app_settings",
] as const;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const zip = new JSZip();
  const dataFolder = zip.folder("data")!;

  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) {
      return new NextResponse(`匯出失敗（${table}）：${error.message}`, { status: 500 });
    }
    dataFolder.file(`${table}.json`, JSON.stringify(data ?? [], null, 2));
  }

  const { data: chatImports } = await supabase.from("chat_imports").select("id, file_name, storage_path");
  const filesFolder = zip.folder("chat-files")!;
  for (const chatImport of chatImports ?? []) {
    const { data: fileBlob } = await supabase.storage.from("chat-imports").download(chatImport.storage_path);
    if (fileBlob) {
      const buffer = await fileBlob.arrayBuffer();
      filesFolder.file(`${chatImport.id}-${chatImport.file_name}`, buffer);
    }
  }

  zip.file(
    "README.txt",
    "Personal CRM 完整資料匯出\n" +
      `匯出時間：${new Date().toISOString()}\n\n` +
      "data/ 內為各資料表的 JSON 匯出。\n" +
      "chat-files/ 內為原始 LINE 聊天記錄 TXT 檔案。\n",
  );

  const content = await zip.generateAsync({ type: "nodebuffer" });

  // `Buffer`'s `ArrayBufferLike` backing type doesn't structurally satisfy the
  // DOM lib's `BlobPart`/`BodyInit` (which want a concrete `ArrayBuffer`), even
  // though a Buffer works fine as a fetch Response body at runtime in Node.
  return new NextResponse(content as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="personal-crm-export-${new Date().toISOString().slice(0, 10)}.zip"`,
    },
  });
}
