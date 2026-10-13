/**
 * Parser for LINE's exported chat .txt files (Taiwan Traditional-Chinese
 * locale, mobile-app export format: tab-separated `HH:mm\t<sender>\t<text>`
 * message lines under full-width-parenthesis date headers).
 *
 * Pure function, no I/O — safe to unit test and to run before anything is
 * written to the database.
 */

export type ParsedMessageType =
  | "text"
  | "sticker"
  | "image"
  | "video"
  | "audio"
  | "file"
  | "call"
  | "system";

export interface ParsedMessage {
  /** 1-based position of this message within the file. */
  sequenceNo: number;
  /** YYYY-MM-DD, from the most recent date header seen. */
  date: string;
  /** HH:mm as written in the file. */
  time: string;
  /** null for system lines that carry no sender column. */
  sender: string | null;
  text: string;
  messageType: ParsedMessageType;
  /** 1-based line number in the original file where this message starts. */
  rawLineRef: number;
  /** Deterministic fingerprint of (date, time, sender, text) for duplicate detection. */
  dedupeHash: string;
}

export interface ParsedChat {
  /** Best-effort chat title extracted from the `[LINE] ...` header line, if present. */
  chatName: string | null;
  /** Unique sender names seen, in first-appearance order. */
  participants: string[];
  messages: ParsedMessage[];
  /** Lines that were skipped because they could not be classified (for a parse-quality preview). */
  warnings: string[];
}

const DATE_HEADER_RE = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})\s*[(（].?[)）]?\s*$/u;
const MESSAGE_START_RE = /^(\d{1,2}):(\d{2})\t(.*)$/;
const HEADER_LINE_RE = /^\[LINE\]\s*(?:與\s*)?[「"]?(.+?)[」"]?\s*(?:的聊天(?:記錄|室)?)?$/u;
const SAVED_AT_RE = /^儲存日期[:：]/u;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Small dependency-free string hash (FNV-1a), good enough for dedupe fingerprints, not cryptography. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function classifyMessageType(sender: string | null, text: string): ParsedMessageType {
  if (sender === null) return "system";
  const trimmed = text.trim();
  if (trimmed === "[貼圖]") return "sticker";
  if (trimmed === "[照片]") return "image";
  if (trimmed === "[影片]") return "video";
  if (trimmed === "[語音訊息]") return "audio";
  if (trimmed.startsWith("[檔案]")) return "file";
  if (trimmed.startsWith("☎") || trimmed.startsWith("通話時間") || trimmed.startsWith("通話")) return "call";
  return "text";
}

interface OpenMessage {
  sequenceNo: number;
  date: string;
  time: string;
  sender: string | null;
  textLines: string[];
  rawLineRef: number;
}

export function parseLineChatExport(raw: string): ParsedChat {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");

  let chatName: string | null = null;
  let currentDate: string | null = null;
  let open: OpenMessage | null = null;
  let sequenceNo = 0;

  const messages: ParsedMessage[] = [];
  const participantsSeen = new Map<string, true>();
  const warnings: string[] = [];

  function flush() {
    if (!open) return;
    const text = open.textLines.join("\n").replace(/\n+$/, "");
    const dedupeHash = fnv1a(`${open.date}|${open.time}|${open.sender ?? ""}|${text}`);
    messages.push({
      sequenceNo: open.sequenceNo,
      date: open.date,
      time: open.time,
      sender: open.sender,
      text,
      messageType: classifyMessageType(open.sender, text),
      rawLineRef: open.rawLineRef,
      dedupeHash,
    });
    open = null;
  }

  lines.forEach((rawLine, index) => {
    const lineNo = index + 1;
    const line = rawLine.replace(/\s+$/, "");

    if (lineNo <= 5 && chatName === null) {
      const headerMatch = HEADER_LINE_RE.exec(line.trim());
      if (headerMatch) {
        chatName = headerMatch[1].trim();
        return;
      }
    }

    if (line.trim() === "" && open === null) return;
    if (SAVED_AT_RE.test(line.trim()) && open === null) return;

    const dateMatch = DATE_HEADER_RE.exec(line.trim());
    if (dateMatch) {
      flush();
      const [, y, m, d] = dateMatch;
      currentDate = `${y}-${pad2(Number(m))}-${pad2(Number(d))}`;
      return;
    }

    const messageMatch = MESSAGE_START_RE.exec(line);
    if (messageMatch) {
      flush();
      const [, hh, mm, rest] = messageMatch;
      if (!currentDate) {
        warnings.push(`第 ${lineNo} 行：找不到日期標頭，已略過`);
        return;
      }

      const tabIndex = rest.indexOf("\t");
      let sender: string | null;
      let text: string;
      if (tabIndex === -1) {
        // No sender column: a system/notification line (join left, join, calls, unsend...).
        sender = null;
        text = rest;
      } else {
        sender = rest.slice(0, tabIndex);
        text = rest.slice(tabIndex + 1);
      }

      sequenceNo += 1;
      open = {
        sequenceNo,
        date: currentDate,
        time: `${hh.padStart(2, "0")}:${mm}`,
        sender,
        textLines: [text],
        rawLineRef: lineNo,
      };
      if (sender) participantsSeen.set(sender, true);
      return;
    }

    if (open) {
      open.textLines.push(line);
      return;
    }

    if (line.trim() !== "") {
      warnings.push(`第 ${lineNo} 行：無法辨識的內容，已略過：${line.slice(0, 50)}`);
    }
  });

  flush();

  return {
    chatName,
    participants: [...participantsSeen.keys()],
    messages,
    warnings,
  };
}
