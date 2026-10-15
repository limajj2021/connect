import "server-only";

import type { LineMessage } from "@/lib/line/api";
import { MAIN_QUICK, listCard, postback, text, uri } from "@/lib/line/flex";
import { batchFormUrl, contactListUrl } from "@/lib/mini/links";
import { isLinkSigningConfigured } from "@/lib/mini/token";

import { type BatchEntry, clearShots, createBatch, loadBatch, saveShot, waitForImageSet } from "./batch";
import type { BotCtx } from "./data";
import type { ContactDraft } from "./extract";

export interface ImageSet {
  id: string;
  index: number;
  total: number;
}

function entryLine(entry: BatchEntry) {
  const shown = entry.draft.line_display_name ?? entry.draft.name ?? "";
  return entry.existing
    ? { text: `・${shown}（${entry.existing.name === entry.draft.name ? "已在人脈" : `可能是 ${entry.existing.name}`}）`, muted: true }
    : { text: `・${shown}` };
}

/** One card for the whole pending batch: who was found, and how to save them. */
export async function batchSummary(ctx: BotCtx): Promise<LineMessage[]> {
  const entries = await loadBatch(ctx);
  if (entries.length === 0) {
    return [text("截圖裡沒有找到人名 🤔 可以傳 LINE「聊天」或「好友」列表的截圖，或單一好友的個人頁截圖。", MAIN_QUICK)];
  }
  const fresh = entries.filter((e) => !e.existing);
  const known = entries.length - fresh.length;
  return [
    listCard({
      altText: `從截圖找到 ${entries.length} 位`,
      title: `📷 從截圖找到 ${entries.length} 位`,
      subtitle: known > 0 ? `新的 ${fresh.length} 位・已在人脈 ${known} 位（會略過）` : "名字是 OCR 讀的，可先挑選／改名",
      items: entries.map(entryLine),
      note: "還有？繼續傳截圖，會合併成同一批。",
      actions: [
        fresh.length > 0 ? postback(`✅ 全部建立（${fresh.length} 位）`, { a: "batch_ok" }, `全部建立 ${fresh.length} 位`) : null,
        isLinkSigningConfigured() ? uri("✏️ 挑選／改名／加標籤", batchFormUrl()) : null,
        postback("取消這批", { a: "batch_cancel" }, "取消這批"),
      ],
    }),
  ];
}

/**
 * A list screenshot (or one image of a multi-image send): park its names, and
 * answer once — after the last image of a set has been read.
 */
export async function receiveShot(
  ctx: BotCtx,
  messageId: string,
  drafts: ContactDraft[],
  imageSet?: ImageSet,
): Promise<LineMessage[]> {
  await saveShot(ctx, messageId, drafts, imageSet?.id);
  if (imageSet) {
    if (imageSet.index < imageSet.total) return []; // the last image answers for the whole set
    await waitForImageSet(ctx, imageSet.id, imageSet.total);
  }
  return batchSummary(ctx);
}

export async function handleBatchPostback(ctx: BotCtx, action: "batch_ok" | "batch_cancel"): Promise<LineMessage[]> {
  if (action === "batch_cancel") {
    await clearShots(ctx);
    return [text("好，這批截圖已取消。", MAIN_QUICK)];
  }
  const fresh = (await loadBatch(ctx)).filter((e) => !e.existing);
  if (fresh.length === 0) return [text("這批已經處理完了（或超過 1 小時已過期）。", MAIN_QUICK)];
  const created = await createBatch(ctx, fresh.map((e) => e.draft));
  await clearShots(ctx);
  const list = contactListUrl();
  return [
    listCard({
      altText: `已建立 ${created.length} 位人脈`,
      title: `✅ 已建立 ${created.length} 位`,
      subtitle: "公司、電話、生日等可以之後在清單裡補",
      items: created.map((c) => ({ text: `・${c.name}` })),
      actions: [list ? uri("📋 打開人脈清單", list) : null],
    }),
  ];
}
