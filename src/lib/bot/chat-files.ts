import "server-only";

import { extractChatTexts } from "@/lib/chat-import/archive";
import { importLineChatFile } from "@/lib/chat-import/import-core";
import type { ChatSource } from "@/lib/chat-import/parse";
import { MAX_IMPORT_FILE_BYTES, type ParticipantMapping } from "@/lib/chat-import/schema";
import { type LineMessage, getProfileDisplayName } from "@/lib/line/api";
import { type ContactForCard, MAIN_QUICK, postback, text, uri } from "@/lib/line/flex";
import { webUrl } from "@/lib/line/links";

import { type BotCtx, CONTACT_CARD_COLUMNS, createContact, updateContact } from "./data";
import { extractContactFields, normalizePhone, parseLineDisplayName } from "./extract";

/** Chat exports (LINE / WhatsApp .txt, or a .zip of them) sent to the bot as files. */

const MAX_ZIP_BYTES = 30 * 1024 * 1024;
const FIELD_NAMES: Record<string, string> = { phone: "電話", email: "Email", line_id: "LINE ID", wechat_id: "WeChat", whatsapp_phone: "WhatsApp" };
const PHONE_NAME_RE = /^\+?[\d\s()-]{8,}$/;

interface ImportOutcome {
  fileName: string;
  ok: boolean;
  error?: string;
  existingImportId?: string;
  importId?: string;
  chatName?: string | null;
  source?: ChatSource;
  chatType?: "individual" | "group";
  messageCount?: number;
  linked: string[];
  created: { name: string; id: string }[];
  filled: string[];
}

interface Shared {
  all: ContactForCard[];
  byKey: Map<string, ContactForCard>;
  ownProfileName: string | null;
}

async function loadShared(ctx: BotCtx): Promise<Shared> {
  const { data, error } = await ctx.supabase.from("contacts").select(CONTACT_CARD_COLUMNS).eq("owner_id", ctx.ownerId);
  if (error) throw error;
  const all = (data ?? []) as ContactForCard[];
  const byKey = new Map<string, ContactForCard>();
  for (const c of all) {
    byKey.set(c.name, c);
    if (c.line_display_name) byKey.set(c.line_display_name, c);
    for (const phone of [c.phone, c.whatsapp_phone]) if (phone) byKey.set(normalizePhone(phone).replace(/^\+886/, "0"), c);
  }
  return { all, byKey, ownProfileName: await getProfileDisplayName(ctx.lineUserId) };
}

async function importOne(ctx: BotCtx, shared: Shared, fileName: string, buffer: ArrayBuffer): Promise<ImportOutcome> {
  const created: { name: string; id: string }[] = [];
  const fuzzyLinked = new Map<string, string>();
  const outcome: ImportOutcome = { fileName, ok: false, linked: [], created, filled: [] };

  const result = await importLineChatFile({
    supabase: ctx.supabase,
    ownerId: ctx.ownerId,
    fileName,
    buffer,
    ownerNames: (parsed) => {
      const names = shared.ownProfileName ? [shared.ownProfileName] : [];
      // A 1-on-1 export is titled with the other person's name, so in a
      // two-person chat whoever isn't in the title is you.
      const people = parsed.participants.filter((p) => p !== "我");
      if (parsed.chatName && people.length === 2) {
        const other = people.find((p) => p === parsed.chatName || parsed.chatName!.includes(p) || p.includes(parsed.chatName!));
        if (other) names.push(...people.filter((p) => p !== other));
      }
      return names;
    },
    resolveMapping: async (participants, { source }) => {
      const mapping: ParticipantMapping = {};
      for (const name of participants) {
        const isPhone = PHONE_NAME_RE.test(name);
        const key = isPhone ? normalizePhone(name).replace(/^\+886/, "0") : name;
        const exact = shared.byKey.get(key);
        if (exact) {
          mapping[name] = { action: "link", contactId: exact.id };
          continue;
        }
        // "Kenny 吳副 @印度班加*" contains the existing contact "Kenny" → same person.
        const containing = isPhone ? [] : shared.all.filter((c) => c.name.length >= 2 && name.includes(c.name));
        if (containing.length === 1) {
          const match = containing[0];
          mapping[name] = { action: "link", contactId: match.id };
          fuzzyLinked.set(name, match.name);
          if (source === "line" && !match.line_display_name) await updateContact(ctx, match.id, { line_display_name: name });
          continue;
        }
        const draft = isPhone
          ? { name, whatsapp_phone: normalizePhone(name) }
          : source === "line"
            ? { ...parseLineDisplayName(name), line_display_name: name }
            : { name };
        const contact = await createContact(ctx, draft);
        shared.all.push(contact);
        shared.byKey.set(key, contact);
        created.push({ name: contact.name, id: contact.id });
        mapping[name] = { action: "link", contactId: contact.id };
      }
      return mapping;
    },
  });

  if (!result.ok) {
    if (result.error.startsWith("無法解析")) {
      // Keep the file (private bucket) so the format can be supported later.
      await ctx.supabase.storage
        .from("chat-imports")
        .upload(`${ctx.ownerId}/unparsed/${Date.now()}.txt`, buffer, { contentType: "text/plain; charset=utf-8" });
      console.info("[line-bot] unparsed chat export saved", fileName);
    }
    return { ...outcome, error: result.error, existingImportId: result.existingImportId };
  }

  // Squeeze what we can out of the chat without AI: phone numbers, emails and
  // messenger IDs each participant typed themselves fill that contact's empty fields.
  for (const participant of result.participants) {
    if (!participant.contactId) continue;
    const own = result.parsed.messages
      .filter((m) => m.sender === participant.name && m.messageType === "text")
      .map((m) => m.text)
      .join("\n");
    if (!own) continue;
    const { draft } = extractContactFields(own);
    const existing = shared.all.find((c) => c.id === participant.contactId);
    const patch: Record<string, unknown> = {};
    for (const field of ["phone", "email", "line_id", "wechat_id", "whatsapp_phone"] as const) {
      if (draft[field] && !existing?.[field]) patch[field] = draft[field];
    }
    if (Object.keys(patch).length > 0) {
      await updateContact(ctx, participant.contactId, patch);
      outcome.filled.push(`${participant.name}：${Object.keys(patch).map((k) => FIELD_NAMES[k]).join("、")}`);
    }
  }

  const createdNames = new Set(created.map((c) => c.id));
  outcome.linked = result.participants
    .filter((p) => p.contactId && !createdNames.has(p.contactId))
    .map((p) => (fuzzyLinked.has(p.name) ? `${p.name} → ${fuzzyLinked.get(p.name)}` : p.name));
  return {
    ...outcome,
    ok: true,
    importId: result.importId,
    chatName: result.chatName,
    source: result.source,
    chatType: result.chatType,
    messageCount: result.messageCount,
  };
}

const SOURCE_LABEL: Record<ChatSource, string> = { line: "LINE", whatsapp: "WhatsApp" };

function fillQuick(outcomes: ImportOutcome[]) {
  return outcomes
    .flatMap((o) => o.created)
    .slice(0, 8)
    .map((c) => postback(`補 ${c.name}`.slice(0, 20), { a: "fill", id: c.id }, `補 ${c.name} 的資料`));
}

function singleSummary(o: ImportOutcome): LineMessage[] {
  if (!o.ok) {
    return [text(o.error ?? "匯入失敗", o.existingImportId ? [uri("看之前的匯入", webUrl(`/records/chats/${o.existingImportId}`))!] : MAIN_QUICK)];
  }
  const lines = [
    `✅ 已匯入${SOURCE_LABEL[o.source!]}「${o.chatName ?? o.fileName}」：${o.messageCount} 則訊息（${o.chatType === "group" ? "群組" : "一對一"}）`,
    o.linked.length > 0 ? `🔗 對應到既有人脈：${o.linked.join("、")}` : null,
    o.created.length > 0 ? `🆕 新建人脈：${o.created.map((c) => c.name).join("、")}` : null,
    o.filled.length > 0 ? `✏️ 從聊天內容補上：\n${o.filled.join("\n")}` : null,
  ].filter(Boolean);
  return [text(lines.join("\n"), [...fillQuick([o]), uri("網頁看聊天", webUrl(`/records/chats/${o.importId}`))!])];
}

function archiveSummary(zipName: string, outcomes: ImportOutcome[], skipped: number): LineMessage[] {
  const ok = outcomes.filter((o) => o.ok);
  const lines = [
    `📦「${zipName}」裡有 ${outcomes.length + skipped} 個聊天紀錄，成功匯入 ${ok.length} 個：`,
    ...outcomes.map((o) =>
      o.ok
        ? `✅ ${SOURCE_LABEL[o.source!]}「${o.chatName ?? o.fileName}」${o.messageCount} 則${o.created.length > 0 ? `，新建 ${o.created.map((c) => c.name).join("、")}` : ""}`
        : `⚠ ${o.fileName}：${o.error}`,
    ),
    skipped > 0 ? `（另有 ${skipped} 個檔案超過一次處理的上限，請分批傳）` : null,
  ].filter(Boolean);
  const filled = ok.flatMap((o) => o.filled);
  if (filled.length > 0) lines.push(`✏️ 從聊天內容補上：\n${filled.slice(0, 10).join("\n")}`);
  return [text(lines.join("\n").slice(0, 4900), [...fillQuick(ok), uri("網頁看聊天紀錄", webUrl("/records"))!])];
}

export async function importChatFile(ctx: BotCtx, fileName: string, buffer: ArrayBuffer): Promise<LineMessage[]> {
  if (buffer.byteLength > MAX_IMPORT_FILE_BYTES) return [text("檔案太大了（上限 15MB）。")];
  const shared = await loadShared(ctx);
  return singleSummary(await importOne(ctx, shared, fileName, buffer));
}

export async function importChatArchive(ctx: BotCtx, zipName: string, buffer: ArrayBuffer): Promise<LineMessage[]> {
  if (buffer.byteLength > MAX_ZIP_BYTES) return [text("壓縮檔太大了（上限 30MB），請分批傳。")];
  let extracted: Awaited<ReturnType<typeof extractChatTexts>>;
  try {
    extracted = await extractChatTexts(buffer, zipName);
  } catch {
    return [text("這個壓縮檔打不開（可能有密碼或已損毀）。請傳一般的 .zip。", MAIN_QUICK)];
  }
  if (extracted.entries.length === 0) {
    return [text("壓縮檔裡沒有找到聊天紀錄 .txt（LINE 或 WhatsApp 匯出的檔案）。", MAIN_QUICK)];
  }
  const shared = await loadShared(ctx);
  const outcomes: ImportOutcome[] = [];
  for (const entry of extracted.entries) {
    if (entry.data.byteLength > MAX_IMPORT_FILE_BYTES) {
      outcomes.push({ fileName: entry.fileName, ok: false, error: "檔案太大（上限 15MB）", linked: [], created: [], filled: [] });
      continue;
    }
    outcomes.push(await importOne(ctx, shared, entry.fileName, entry.data));
  }
  return outcomes.length === 1 ? singleSummary(outcomes[0]) : archiveSummary(zipName, outcomes, extracted.skipped);
}
