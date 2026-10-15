import "server-only";

import { type LineMessage, getMessageContent, replyOrPush, showLoading } from "@/lib/line/api";
import { lineConfig } from "@/lib/line/config";
import { MAIN_QUICK, helpMessages, text, uri } from "@/lib/line/flex";
import { webUrl } from "@/lib/line/links";
import { isOcrConfigured, ocrImage } from "@/lib/ocr/ocr-space";
import { createAdminClient, getOwnerUserId } from "@/lib/supabase/admin";
import { taipeiToday } from "@/lib/format-date";

import { type ImageSet, receiveShot } from "./batch-chat";
import { importChatArchive, importChatFile } from "./chat-files";
import { detectContactList } from "./contact-list";
import { type BotCtx, loadSession } from "./data";
import { extractFromScreenshot, looksLikeProfilePage, parseLineDisplayName } from "./extract";
import { appendToCollect } from "./forward";
import { receivePost } from "./social-flow";
import { type FlowState, createFromScreenshot, handlePostback, handleText } from "./handlers";
import { parseIntent } from "./intent";

/** The subset of LINE webhook event fields this bot reads. */
export interface LineEvent {
  type: string;
  replyToken?: string;
  webhookEventId?: string;
  deliveryContext?: { isRedelivery?: boolean };
  source?: { type: string; userId?: string };
  message?: { id: string; type: string; text?: string; fileName?: string; fileSize?: number; imageSet?: ImageSet };
  postback?: { data: string };
}

async function handleImage(ctx: BotCtx, messageId: string, imageSet?: ImageSet): Promise<LineMessage[]> {
  if (!isOcrConfigured()) {
    return [text("圖片辨識還沒開啟（需要設定免費的 OCR 金鑰）。先直接打字給我吧，例如：\n新增 王小明 台積電 經理 0912345678")];
  }
  // Several images sent at once are collected into one batch.
  const set = imageSet && imageSet.total > 1 ? imageSet : undefined;
  const image = await getMessageContent(messageId);
  const ocr = await ocrImage(image);
  if (!ocr.ok) {
    if (set) return receiveShot(ctx, messageId, [], set); // still counts toward the set
    return [text(`圖片辨識失敗：${ocr.error}\n可以改用打字：新增 名字 公司 電話…`, MAIN_QUICK)];
  }

  const state = await loadSession<FlowState>(ctx);
  if (state?.flow === "post_wait") {
    // A screenshot of someone's LinkedIn / Facebook post, after 動態.
    return receivePost(ctx, state, { text: ocr.text, fromImage: true });
  }
  if (state?.flow === "collect") {
    // A chat screenshot while forwarding: keep its text with the other messages.
    return appendToCollect(ctx, state, [`［截圖］${ocr.text}`]);
  }

  // A chat list / friend list screenshot: everyone in it, in one go.
  const list = looksLikeProfilePage(ocr.text) ? null : detectContactList(ocr.lines);
  if (list) return receiveShot(ctx, messageId, list.names.map((name) => parseLineDisplayName(name)), set);

  const { draft, sure } = extractFromScreenshot(ocr.text);
  if (set) return receiveShot(ctx, messageId, draft.name ? [draft] : [], set);
  const found = Object.keys(draft).filter((k) => k !== "notes").length;
  if (found === 0) {
    return [text(`我讀到這些字，但認不出聯絡資料：\n${ocr.text.slice(0, 300)}\n\n可以告訴我這是誰嗎？例如：新增 王小明 …`, MAIN_QUICK)];
  }
  return createFromScreenshot(ctx, draft, sure);
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
      return handleImage(ctx, message.id, message.imageSet);
    case "file": {
      const name = message.fileName ?? "chat.txt";
      const lower = name.toLowerCase();
      if (!lower.endsWith(".txt") && !lower.endsWith(".zip")) {
        return [
          text("目前支援 LINE／WhatsApp 匯出的聊天 .txt，或把它們打包的 .zip。CSV／Excel 人脈清單請到網頁匯入：", [
            uri("網頁匯入", webUrl("/settings"))!,
          ]),
        ];
      }
      await showLoading(ctx.lineUserId, 60);
      const buffer = await getMessageContent(message.id);
      return lower.endsWith(".zip") ? importChatArchive(ctx, name, buffer) : importChatFile(ctx, name, buffer);
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
