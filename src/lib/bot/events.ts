import "server-only";

import { importLineChatFile } from "@/lib/chat-import/import-core";
import { MAX_IMPORT_FILE_BYTES, type ParticipantMapping } from "@/lib/chat-import/schema";
import { type LineMessage, getMessageContent, getProfileDisplayName, replyOrPush, showLoading } from "@/lib/line/api";
import { lineConfig } from "@/lib/line/config";
import { MAIN_QUICK, helpMessages, postback, text, uri } from "@/lib/line/flex";
import { webUrl } from "@/lib/line/links";
import { isOcrConfigured, ocrImage } from "@/lib/ocr/ocr-space";
import { createAdminClient, getOwnerUserId } from "@/lib/supabase/admin";
import { taipeiToday } from "@/lib/format-date";

import { type BotCtx, CONTACT_CARD_COLUMNS, createContact, loadSession, updateContact } from "./data";
import { extractContactFields, extractFromOcr, parseLineDisplayName } from "./extract";
import { appendToCollect } from "./forward";
import { type FlowState, createFromScreenshot, handlePostback, handleText } from "./handlers";
import { parseIntent } from "./intent";
import type { ContactForCard } from "@/lib/line/flex";

/** The subset of LINE webhook event fields this bot reads. */
export interface LineEvent {
  type: string;
  replyToken?: string;
  webhookEventId?: string;
  deliveryContext?: { isRedelivery?: boolean };
  source?: { type: string; userId?: string };
  message?: { id: string; type: string; text?: string; fileName?: string; fileSize?: number };
  postback?: { data: string };
}

async function importChatFromLine(ctx: BotCtx, messageId: string, fileName: string): Promise<LineMessage[]> {
  const buffer = await getMessageContent(messageId);
  if (buffer.byteLength > MAX_IMPORT_FILE_BYTES) return [text("檔案太大了（上限 15MB）。")];

  const { data: contacts, error } = await ctx.supabase
    .from("contacts")
    .select(CONTACT_CARD_COLUMNS)
    .eq("owner_id", ctx.ownerId);
  if (error) throw error;
  const all = (contacts ?? []) as ContactForCard[];
  const byName = new Map<string, ContactForCard>();
  for (const c of all) {
    byName.set(c.name, c);
    if (c.line_display_name) byName.set(c.line_display_name, c);
  }

  const ownProfileName = await getProfileDisplayName(ctx.lineUserId);
  const created = new Set<string>();
  const fuzzyLinked = new Map<string, string>(); // participant → contact name it was matched to

  const result = await importLineChatFile({
    supabase: ctx.supabase,
    ownerId: ctx.ownerId,
    fileName,
    buffer,
    ownerNames: (parsed) => {
      const names = ownProfileName ? [ownProfileName] : [];
      // A 1-on-1 export is titled with the other person's name, so in a
      // two-person chat whoever isn't in the title is you.
      const people = parsed.participants.filter((p) => p !== "我");
      if (parsed.chatName && people.length === 2) {
        const other = people.find((p) => p === parsed.chatName || parsed.chatName!.includes(p) || p.includes(parsed.chatName!));
        if (other) names.push(...people.filter((p) => p !== other));
      }
      return names;
    },
    resolveMapping: async (participants) => {
      const mapping: ParticipantMapping = {};
      for (const name of participants) {
        const exact = byName.get(name);
        if (exact) {
          mapping[name] = { action: "link", contactId: exact.id };
          continue;
        }
        // "Kenny 吳副 @印度班加*" contains the existing contact "Kenny" → same person.
        const containing = all.filter((c) => c.name.length >= 2 && name.includes(c.name));
        if (containing.length === 1) {
          const match = containing[0];
          mapping[name] = { action: "link", contactId: match.id };
          fuzzyLinked.set(name, match.name);
          if (!match.line_display_name) await updateContact(ctx, match.id, { line_display_name: name });
          continue;
        }
        const contact = await createContact(ctx, { ...parseLineDisplayName(name), line_display_name: name });
        created.add(name);
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
    return [
      text(
        result.error,
        result.existingImportId ? [uri("看之前的匯入", webUrl(`/records/chats/${result.existingImportId}`))!] : MAIN_QUICK,
      ),
    ];
  }

  // Squeeze what we can out of the chat without AI: phone numbers, emails and
  // messenger IDs each participant typed themselves fill that contact's empty fields.
  const filled: string[] = [];
  for (const participant of result.participants) {
    if (!participant.contactId) continue;
    const own = result.parsed.messages
      .filter((m) => m.sender === participant.name && m.messageType === "text")
      .map((m) => m.text)
      .join("\n");
    if (!own) continue;
    const { draft } = extractContactFields(own);
    const existing = all.find((c) => c.id === participant.contactId);
    const patch: Record<string, unknown> = {};
    for (const field of ["phone", "email", "line_id", "wechat_id", "whatsapp_phone"] as const) {
      if (draft[field] && !existing?.[field]) patch[field] = draft[field];
    }
    if (Object.keys(patch).length > 0) {
      await updateContact(ctx, participant.contactId, patch);
      filled.push(`${participant.name}：${Object.keys(patch).map((k) => ({ phone: "電話", email: "Email", line_id: "LINE ID", wechat_id: "WeChat", whatsapp_phone: "WhatsApp" })[k]).join("、")}`);
    }
  }

  const linked = result.participants
    .filter((p) => p.contactId && !created.has(p.name))
    .map((p) => (fuzzyLinked.has(p.name) ? `${p.name} → ${fuzzyLinked.get(p.name)}` : p.name));
  const createdNames = [...created];
  const lines = [
    `✅ 已匯入「${result.chatName ?? fileName}」：${result.messageCount} 則訊息（${result.chatType === "group" ? "群組" : "一對一"}）`,
    linked.length > 0 ? `🔗 對應到既有人脈：${linked.join("、")}` : null,
    createdNames.length > 0 ? `🆕 新建人脈：${createdNames.join("、")}` : null,
    filled.length > 0 ? `✏️ 從聊天內容補上：\n${filled.join("\n")}` : null,
  ].filter(Boolean);

  const createdContacts = result.participants.filter((p) => created.has(p.name) && p.contactId).slice(0, 8);
  return [
    text(lines.join("\n"), [
      ...createdContacts.map((p) => postback(`補 ${p.name}`, { a: "fill", id: p.contactId! }, `補 ${p.name} 的資料`)),
      uri("網頁看聊天", webUrl(`/records/chats/${result.importId}`))!,
    ]),
  ];
}

async function handleImage(ctx: BotCtx, messageId: string): Promise<LineMessage[]> {
  if (!isOcrConfigured()) {
    return [text("圖片辨識還沒開啟（需要設定免費的 OCR 金鑰）。先直接打字給我吧，例如：\n新增 王小明 台積電 經理 0912345678")];
  }
  const image = await getMessageContent(messageId);
  const ocr = await ocrImage(image);
  if (!ocr.ok) return [text(`圖片辨識失敗：${ocr.error}\n可以改用打字：新增 名字 公司 電話…`, MAIN_QUICK)];

  const state = await loadSession<FlowState>(ctx);
  if (state?.flow === "collect") {
    // A chat screenshot while forwarding: keep its text with the other messages.
    return appendToCollect(ctx, state, [`［截圖］${ocr.text}`]);
  }

  const draft = extractFromOcr(ocr.text);
  const found = Object.keys(draft).filter((k) => k !== "notes").length;
  if (found === 0) {
    return [text(`我讀到這些字，但認不出聯絡資料：\n${ocr.text.slice(0, 300)}\n\n可以告訴我這是誰嗎？例如：新增 王小明 …`, MAIN_QUICK)];
  }
  return createFromScreenshot(ctx, draft);
}

/** Messages LINE can deliver but the bot can't read (stickers, voice, shared contacts…). */
function unsupportedMessage(type: string): LineMessage[] {
  const hints: Record<string, string> = {
    sticker: "收到貼圖 😄",
    audio: "語音訊息我還聽不懂，請改用打字。",
    video: "影片我看不到內容，可以改傳截圖。",
    location: "收到位置了，但我目前不會用它 🙏",
  };
  return [
    text(
      `${hints[type] ?? `這種訊息（${type}）我讀不到內容。`}\n要建立好友資料，可以傳他的個人頁截圖或名片照片，我會用 OCR 辨識。`,
      MAIN_QUICK,
    ),
  ];
}

async function respond(ctx: BotCtx, event: LineEvent): Promise<LineMessage[]> {
  if (event.type === "follow") {
    return [text("嗨！我是你的私人人脈小幫手 👋"), ...helpMessages()];
  }
  if (event.type === "postback" && event.postback) {
    return handlePostback(ctx, event.postback.data);
  }
  if (event.type !== "message" || !event.message) return [];

  const message = event.message;
  switch (message.type) {
    case "text":
      return handleText(ctx, message.text ?? "");
    case "image":
      await showLoading(ctx.lineUserId, 30);
      return handleImage(ctx, message.id);
    case "file": {
      const name = message.fileName ?? "chat.txt";
      if (!name.toLowerCase().endsWith(".txt")) {
        return [text("目前只支援 LINE 匯出的聊天 .txt 檔。CSV／Excel 人脈清單請到網頁匯入：", [uri("網頁匯入", webUrl("/settings"))!])];
      }
      await showLoading(ctx.lineUserId, 30);
      return importChatFromLine(ctx, message.id, name);
    }
    default:
      return unsupportedMessage(message.type);
  }
}

/**
 * Only the owner is served. Returns a context for the owner, or null after
 * replying whatever is appropriate to anyone else (setup hint / private notice).
 */
async function ownerContext(event: LineEvent): Promise<BotCtx | null> {
  const userId = event.source?.userId;
  if (!userId || event.source?.type !== "user") return null;
  if (event.deliveryContext?.isRedelivery) return null; // never double-apply a write

  const { ownerUserId } = lineConfig();
  if (!ownerUserId) {
    // First-time setup: tell the person their userId so it can be configured.
    if (event.replyToken) {
      await replyOrPush(event.replyToken, userId, [
        text(`設定用：你的 LINE userId 是\n${userId}\n\n把它設為 LINE_OWNER_USER_ID 後，我就只會回應你。`),
      ]);
    }
    return null;
  }
  if (userId !== ownerUserId) {
    if (event.replyToken && event.type === "message") {
      await replyOrPush(event.replyToken, userId, [text("這是私人帳號，無法提供服務，謝謝 🙏")]);
    }
    return null;
  }
  return { supabase: createAdminClient(), ownerId: await getOwnerUserId(), lineUserId: userId, today: taipeiToday() };
}

async function run(ctx: BotCtx, replyToken: string | undefined, work: () => Promise<LineMessage[]>) {
  let messages: LineMessage[];
  try {
    messages = await work();
  } catch (error) {
    console.error("[line-bot] handler failed", error);
    messages = [text("抱歉，剛剛出了點問題，請再試一次 🙏", MAIN_QUICK)];
  }
  if (messages.length > 0) await replyOrPush(replyToken, ctx.lineUserId, messages);
}

/** Processes one webhook event end to end (runs after the 200 response). */
export async function processLineEvent(event: LineEvent) {
  if (event.type === "message" && event.message && !["text", "image", "file"].includes(event.message.type)) {
    // Logged on purpose: shows what LINE actually sends for unusual message types.
    console.info("[line-bot] unhandled message payload", JSON.stringify(event.message));
  }
  const ctx = await ownerContext(event);
  if (!ctx) return;
  await run(ctx, event.replyToken, () => respond(ctx, event));
}

const isPlainText = (e: LineEvent) => e.type === "message" && e.message?.type === "text";

/**
 * Forwarding several messages at once arrives as a burst of text events in
 * one webhook call. When none of them is a command, park them together and
 * answer once (instead of one reply per forwarded line).
 */
export async function processLineEvents(events: LineEvent[]) {
  const texts = events.filter(isPlainText);
  const isForwardBurst =
    texts.length >= 2 &&
    texts.every((e) => e.source?.userId === texts[0].source?.userId) &&
    texts.every((e) => parseIntent(e.message?.text ?? "").kind === "unknown");

  if (isForwardBurst) {
    const last = texts[texts.length - 1];
    const ctx = await ownerContext(last);
    if (ctx) {
      await run(ctx, last.replyToken, async () => {
        const state = await loadSession<FlowState>(ctx);
        return appendToCollect(ctx, state?.flow === "collect" ? state : null, texts.map((e) => e.message?.text ?? ""));
      });
    }
    for (const event of events.filter((e) => !isPlainText(e))) await processLineEvent(event);
    return;
  }
  // Sequential on purpose: keeps one user's quick successive messages in order.
  for (const event of events) await processLineEvent(event);
}
