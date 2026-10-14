"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient, getAuthUser } from "@/lib/supabase/server";
import { importLineChatFile } from "@/lib/chat-import/import-core";
import { MAX_IMPORT_FILE_BYTES, participantMappingSchema, type ParticipantMapping } from "@/lib/chat-import/schema";

export interface ImportActionState {
  error?: string;
  existingImportId?: string;
}

export async function importChat(_prev: ImportActionState, formData: FormData): Promise<ImportActionState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "請選擇要匯入的 LINE 聊天記錄 TXT 檔案" };
  }
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return { error: `檔案過大（上限 ${Math.floor(MAX_IMPORT_FILE_BYTES / 1024 / 1024)}MB）` };
  }
  if (!file.name.toLowerCase().endsWith(".txt")) {
    return { error: "僅支援 LINE 匯出的 .txt 檔案" };
  }

  const mappingRaw = formData.get("mapping");
  const mappingParsed = participantMappingSchema.safeParse(
    mappingRaw ? JSON.parse(String(mappingRaw)) : {},
  );
  if (!mappingParsed.success) {
    return { error: "人脈對應資料格式錯誤" };
  }
  const mapping: ParticipantMapping = mappingParsed.data;

  const supabase = await createClient();
  const user = await getAuthUser(supabase);
  if (!user) {
    return { error: "請重新登入後再試一次" };
  }

  const result = await importLineChatFile({
    supabase,
    ownerId: user.id,
    fileName: file.name,
    buffer: await file.arrayBuffer(),
    resolveMapping: () => mapping,
  });
  if (!result.ok) {
    return { error: result.error, existingImportId: result.existingImportId };
  }

  revalidatePath("/records");
  redirect(`/records/chats/${result.importId}`);
}

export async function deleteChatImport(chatImportId: string, storagePath: string) {
  const supabase = await createClient();
  const { error: storageError } = await supabase.storage.from("chat-imports").remove([storagePath]);
  if (storageError) {
    throw new Error("刪除原始檔案失敗，請稍後再試");
  }
  const { error } = await supabase.from("chat_imports").delete().eq("id", chatImportId);
  if (error) throw new Error("刪除失敗，請稍後再試");

  revalidatePath("/records");
  redirect("/records");
}
