import type { ChatMessageRow } from "@/types/database";

export interface ChunkMessage {
  /** Local reference number within this chunk — never a database id. */
  ref: number;
  id: string;
  time: string;
  sender: string;
  text: string;
}

export interface MessageChunk {
  messages: ChunkMessage[];
}

const DEFAULT_MAX_CHARS = 12000;
const DEFAULT_MAX_MESSAGES = 150;

function formatTime(sentAt: string | null): string {
  if (!sentAt) return "";
  const date = new Date(sentAt);
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * Splits messages into chunks that respect both a message-count and a rough
 * character budget, so a single API call to the model stays within a
 * reasonable context size for long conversations. Non-text messages (stickers,
 * photos, calls...) are kept as their placeholder text since they can still
 * carry conversational meaning (e.g. a sticker right after a question).
 */
export function chunkMessages(
  messages: ChatMessageRow[],
  opts: { maxChars?: number; maxMessages?: number } = {},
): MessageChunk[] {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const maxMessages = opts.maxMessages ?? DEFAULT_MAX_MESSAGES;

  const chunks: MessageChunk[] = [];
  let current: ChunkMessage[] = [];
  let currentChars = 0;
  let ref = 0;

  for (const message of messages) {
    const text = message.message_text ?? "";
    const entry: ChunkMessage = {
      ref,
      id: message.id,
      time: formatTime(message.sent_at),
      sender: message.speaker_display_name ?? "（系統）",
      text,
    };

    if (current.length > 0 && (current.length >= maxMessages || currentChars + text.length > maxChars)) {
      chunks.push({ messages: current });
      current = [];
      currentChars = 0;
    }

    current.push(entry);
    currentChars += text.length;
    ref += 1;
  }

  if (current.length > 0) chunks.push({ messages: current });
  return chunks;
}
