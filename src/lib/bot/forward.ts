import "server-only";

import { sha256Hex } from "@/lib/chat-import/hash";
import type { LineMessage } from "@/lib/line/api";
import { type ContactForCard, MAIN_QUICK, carousel, contactBubble, postback, text, uri } from "@/lib/line/flex";
import { webUrl } from "@/lib/line/links";

import {
  type BotCtx,
  contactsMentionedIn,
  createContact,
  findContactByExactName,
  getContact,
  recentContacts,
  saveSession,
  searchContacts,
  updateContact,
} from "./data";
import { type ContactDraft, extractContactFields, normalizeText } from "./extract";

/**
 * "Forward a chat instead of a contact card": LINE never delivers shared
 * contacts to a bot, but messages forwarded from a friend's chat arrive as
 * ordinary texts (and chat screenshots as images). They are parked here until
 * you say whose conversation it is, then saved as that person's chat record
 * and mined for phone / email / IDs / birthday.
 */
export type CollectState = { flow: "collect"; items: string[]; awaitingName?: boolean };

const MAX_ITEMS = 300;
const MAX_CHARS = 50_000;

const SELF_INTRO_RE = /(?:我是|我叫|敝姓|本人|名字是|my name is|i'?m)\s*([一-鿿]{2,4}|[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/i;

/** A name worth offering as "➕ 新增 X" — only from explicit self-introductions. */
export function guessNameFromMessages(items: string[]): string | undefined {
  const joined = normalizeText(items.join("\n"));
  const intro = joined.match(SELF_INTRO_RE);
  if (intro) return intro[1].trim();
  // A single typed line like "王小明 0912345678" (name + details, no command).
  if (items.length === 1) {
    const { draft } = extractContactFields(items[0]);
    if (draft.name && (draft.phone || draft.email || draft.line_id || draft.company)) return draft.name;
  }
  return undefined;
}

async function collectPrompt(ctx: BotCtx, items: string[]): Promise<LineMessage> {
  const joined = items.join("\n");
  const mentioned = await contactsMentionedIn(ctx, joined);
  const { contacts: recent } = await recentContacts(ctx, 6);
  const options = [...new Map([...mentioned, ...recent].map((c) => [c.id, c])).values()].slice(0, 6);
  const guess = guessNameFromMessages(items);

  const quick = [
    ...(guess && !options.some((c) => c.name === guess) ? [postback(`➕ 新增 ${guess}`, { a: "collect_new", n: guess }, `新增 ${guess}`)] : []),
    ...options.map((c) => postback(`👤 ${c.name}`, { a: "collect_to", id: c.id }, `存到 ${c.name}`)),
    postback("➕ 新增人脈", { a: "collect_new" }, "新增人脈"),
    postback("✖ 不用存", { a: "collect_cancel" }, "不用存"),
  ];
  const body =
    items.length === 0
      ? "好，請到好友的聊天室長按訊息 →「轉傳」，可以一次勾選多則傳給我。傳完選這是跟誰的對話 👇"
      : items.length === 1
        ? "📥 收到一則訊息先幫你存著。\n如果是從聊天室轉傳來的，可以繼續轉傳；傳完選這是跟誰的對話（或打「是 王小明」）："
        : `📥 已暫存 ${items.length} 則訊息，這是跟誰的對話？（也可以打「是 王小明」）`;
  return text(body, quick);
}

export async function startCollect(ctx: BotCtx): Promise<LineMessage[]> {
  await saveSession(ctx, { flow: "collect", items: [] } satisfies CollectState);
  return [await collectPrompt(ctx, [])];
}

export async function appendToCollect(ctx: BotCtx, state: CollectState | null, newItems: string[]): Promise<LineMessage[]> {
  const items = [...(state?.items ?? []), ...newItems.map((t) => t.trim()).filter(Boolean)];
  while (items.length > MAX_ITEMS || items.join("\n").length > MAX_CHARS) items.shift();
  await saveSession(ctx, { flow: "collect", items } satisfies CollectState);
  return [await collectPrompt(ctx, items)];
}

/** Stores forwarded texts as a chat record linked to the contact (same tables as a TXT import). */
async function saveForwardedChat(ctx: BotCtx, contact: Pick<ContactForCard, "id" | "name">, items: string[]): Promise<string> {
  const content = `[LINE] 與「${contact.name}」的轉傳訊息\n儲存日期：${ctx.today}\n\n${items.join("\n\n")}\n`;
  const bytes = new TextEncoder().encode(content);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const fileHash = await sha256Hex(buffer);

  const { data: existing } = await ctx.supabase
    .from("chat_imports")
    .select("id")
    .eq("owner_id", ctx.ownerId)
    .eq("file_hash", fileHash)
    .maybeSingle();
  if (existing) return existing.id as string;

  const storagePath = `${ctx.ownerId}/${fileHash}.txt`;
  const { error: uploadError } = await ctx.supabase.storage
    .from("chat-imports")
    .upload(storagePath, buffer, { contentType: "text/plain; charset=utf-8", upsert: true });
  if (uploadError) throw uploadError;

  const { data: chatImport, error } = await ctx.supabase
    .from("chat_imports")
    .insert({
      owner_id: ctx.ownerId,
      file_name: `轉傳-${contact.name}-${ctx.today}.txt`,
      file_hash: fileHash,
      storage_path: storagePath,
      source_chat_name: `${contact.name}（轉傳）`,
      chat_type: "individual",
      primary_contact_id: contact.id,
      parse_status: "completed",
      message_count: items.length,
    })
    .select("id")
    .single();
  if (error) throw error;

  const { error: participantError } = await ctx.supabase
    .from("chat_participants")
    .insert({ chat_import_id: chatImport.id, display_name: contact.name, contact_id: contact.id, is_linked: true });
  if (participantError) throw participantError;

  const sentAt = new Date().toISOString();
  const { error: messageError } = await ctx.supabase.from("chat_messages").insert(
    items.map((message_text, i) => ({
      chat_import_id: chatImport.id,
      // Forwarded messages carry no sender, so who said what is unknown.
      speaker_display_name: "轉傳",
      message_text,
      message_type: "text",
      sent_at: sentAt,
      sequence_no: i + 1,
    })),
  );
  if (messageError) throw messageError;
  return chatImport.id as string;
}

const FILL_LABELS: Record<string, string> = {
  phone: "電話",
  email: "Email",
  line_id: "LINE ID",
  wechat_id: "WeChat",
  whatsapp_phone: "WhatsApp",
  company: "公司",
  title: "職稱",
  birthday_month: "生日",
};

/** Fields found in the messages that the contact doesn't have yet (never overwrites). */
function fillableFrom(contact: ContactForCard | null, draft: ContactDraft) {
  const patch: Record<string, unknown> = {};
  for (const key of ["phone", "email", "line_id", "wechat_id", "whatsapp_phone", "company", "title"] as const) {
    if (draft[key] && !contact?.[key]) patch[key] = draft[key];
  }
  if (draft.birthday_month && draft.birthday_day && !contact?.birthday_month) {
    patch.birthday_month = draft.birthday_month;
    patch.birthday_day = draft.birthday_day;
    if (draft.birthday_year) patch.birthday_year = draft.birthday_year;
  }
  return patch;
}

function summary(contact: ContactForCard, count: number, importId: string, patch: Record<string, unknown>, created: boolean) {
  const filled = Object.keys(patch)
    .map((k) => FILL_LABELS[k])
    .filter(Boolean);
  return [
    text(
      [
        created ? `✅ 已建立「${contact.name}」` : null,
        `💬 已把 ${count} 則訊息存到「${contact.name}」的聊天紀錄`,
        filled.length > 0 ? `✏️ 從內容補上：${[...new Set(filled)].join("、")}（不對可在卡片「⋯ 更多」修改）` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    carousel(contact.name, [contactBubble(contact)], [uri("網頁看聊天", webUrl(`/records/chats/${importId}`))!, ...MAIN_QUICK.slice(0, 4)]),
  ];
}

export async function finalizeToContact(ctx: BotCtx, state: CollectState, contactId: string): Promise<LineMessage[]> {
  const contact = await getContact(ctx, contactId);
  if (!contact) return [text("找不到這位人脈。", MAIN_QUICK)];
  if (state.items.length === 0) return [text("還沒收到任何訊息，先轉傳給我吧。")];
  const importId = await saveForwardedChat(ctx, contact, state.items);
  const patch = fillableFrom(contact, extractContactFields(state.items.join("\n")).draft);
  const updated = Object.keys(patch).length > 0 ? await updateContact(ctx, contact.id, patch) : contact;
  await saveSession(ctx, null);
  return summary(updated, state.items.length, importId, patch, false);
}

export async function finalizeNew(ctx: BotCtx, state: CollectState, name?: string): Promise<LineMessage[]> {
  const cleanName = name ? normalizeText(name).trim().slice(0, 100) : "";
  if (!cleanName) {
    await saveSession(ctx, { ...state, awaitingName: true } satisfies CollectState);
    return [text("對方的名字是？", [postback("✖ 不用存", { a: "collect_cancel" }, "不用存")])];
  }
  if (state.items.length === 0) return [text("還沒收到任何訊息，先轉傳給我吧。")];
  const patch = fillableFrom(null, extractContactFields(state.items.join("\n")).draft);
  const contact = await createContact(ctx, { name: cleanName, ...patch } as ContactDraft);
  const importId = await saveForwardedChat(ctx, contact, state.items);
  await saveSession(ctx, null);
  return summary(contact, state.items.length, importId, patch, true);
}

/** "是 王小明" while messages are parked. */
export async function finalizeByName(ctx: BotCtx, state: CollectState, name: string): Promise<LineMessage[]> {
  const exact = await findContactByExactName(ctx, name);
  const matches = exact.length > 0 ? exact : await searchContacts(ctx, name, 5);
  if (matches.length === 1) return finalizeToContact(ctx, state, matches[0].id);
  if (matches.length > 1) {
    return [
      text(
        `有 ${matches.length} 位符合「${name}」，是哪一位？`,
        [
          ...matches.map((c) => postback(`👤 ${c.name}${c.company ? `（${c.company}）` : ""}`, { a: "collect_to", id: c.id }, `存到 ${c.name}`)),
          postback(`➕ 新增 ${name}`, { a: "collect_new", n: name }, `新增 ${name}`),
        ],
      ),
    ];
  }
  return finalizeNew(ctx, state, name);
}
