import "server-only";

import { lineConfig } from "./config";

export type LineMessage = { type: string } & Record<string, unknown>;

export class LineApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`LINE API ${status}: ${body}`);
  }
}

async function call(path: string, body: unknown, base = lineConfig().apiBase) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${lineConfig().channelAccessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new LineApiError(res.status, await res.text());
  return res;
}

/** LINE accepts at most 5 messages per reply/push. */
function capMessages(messages: LineMessage[]) {
  if (messages.length <= 5) return messages;
  return [...messages.slice(0, 4), { type: "text", text: `…還有 ${messages.length - 4} 則，請打「今日」或到網頁查看。` }];
}

export async function replyMessage(replyToken: string, messages: LineMessage[]) {
  await call("/v2/bot/message/reply", { replyToken, messages: capMessages(messages) });
}

export async function pushMessage(to: string, messages: LineMessage[]) {
  await call("/v2/bot/message/push", { to, messages: capMessages(messages) });
}

/**
 * Reply when the token is still valid (free), otherwise fall back to push
 * (counts against the monthly quota) — e.g. after a slow OCR call.
 */
export async function replyOrPush(replyToken: string | undefined, to: string, messages: LineMessage[]) {
  if (replyToken) {
    try {
      await replyMessage(replyToken, messages);
      return;
    } catch (error) {
      if (!(error instanceof LineApiError) || error.status !== 400) throw error;
    }
  }
  await pushMessage(to, messages);
}

/** Shows the "…" typing animation in the user's chat while we work. */
export async function showLoading(chatId: string, loadingSeconds = 20) {
  try {
    await call("/v2/bot/chat/loading/start", { chatId, loadingSeconds });
  } catch {
    // Purely cosmetic — never fail the real work because of it.
  }
}

export async function getMessageContent(messageId: string): Promise<ArrayBuffer> {
  const { dataApiBase, channelAccessToken } = lineConfig();
  const res = await fetch(`${dataApiBase}/v2/bot/message/${encodeURIComponent(messageId)}/content`, {
    headers: { authorization: `Bearer ${channelAccessToken}` },
  });
  if (!res.ok) throw new LineApiError(res.status, await res.text());
  return res.arrayBuffer();
}

/** Display name of a user who has added the bot (used to recognise "you" in chat exports). */
export async function getProfileDisplayName(userId: string): Promise<string | null> {
  const { apiBase, channelAccessToken } = lineConfig();
  try {
    const res = await fetch(`${apiBase}/v2/bot/profile/${encodeURIComponent(userId)}`, {
      headers: { authorization: `Bearer ${channelAccessToken}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { displayName?: string };
    return json.displayName ?? null;
  } catch {
    return null;
  }
}
