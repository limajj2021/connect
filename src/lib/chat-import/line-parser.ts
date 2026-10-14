/**
 * Parser for LINE's exported chat .txt files: tab-separated
 * `<time>\t<sender>\t<text>` message lines under date header lines. The app's
 * UI language changes the header, date and time formats, so this accepts the
 * Traditional-Chinese, English and Japanese variants (24h or AM/PM times,
 * Y/M/D or M/D/Y dates).
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

// "[LINE] 與「X」的聊天記錄" / "[LINE] Chat history with X" / "[LINE] Chat with X" /
// "[LINE] Chat history in "X"" (groups) / "[LINE] Xとのトーク履歴"
const HEADER_LINE_RE =
  /^\[LINE\]\s*(?:與\s*|Chat\s+(?:history\s+)?(?:with|in)\s+)?[「"“]?(.+?)[」"”]?\s*(?:的聊天(?:記錄|室)?|とのトーク履歴|のトーク履歴)?$/iu;
const SAVED_AT_RE = /^(?:儲存日期|保存日時|Saved on)\s*[:：]?/iu;
// A message line: optional 上午/下午/AM/PM marker before or after the time, then a tab.
const MESSAGE_START_RE = /^(?:(上午|下午|午前|午後|AM|PM)\s*)?(\d{1,2}):(\d{2})(?:\s*(AM|PM|am|pm))?\t(.*)$/;
const YMD_RE = /(\d{4})\s*[/.\-年]\s*(\d{1,2})\s*[/.\-月]\s*(\d{1,2})/;
const MDY_RE = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
// What may surround the date on a header line: weekday names, brackets, commas.
const DATE_DECORATION_RE =
  /^[\s,.()（）日]*(?:(?:週|周|星期)?[一二三四五六日天]|[月火水木金土日](?:曜日)?|(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\.?)?[\s,.()（）日]*$/i;

/** Returns YYYY-MM-DD when the line is nothing but a date header, else null. */
function parseDateHeader(line: string): string | null {
  if (line.includes("\t") || line.length > 40) return null;
  const ymd = YMD_RE.exec(line);
  const mdy = ymd ? null : MDY_RE.exec(line);
  const match = ymd ?? mdy;
  if (!match) return null;
  const rest = line.replace(match[0], " ");
  if (!rest.split(/\s+/).every((part) => part === "" || DATE_DECORATION_RE.test(part))) return null;
  const [y, m, d] = ymd ? [match[1], match[2], match[3]] : [match[3], match[1], match[2]];
  if (Number(m) < 1 || Number(m) > 12 || Number(d) < 1 || Number(d) > 31) return null;
  return `${y}-${pad2(Number(m))}-${pad2(Number(d))}`;
}

function to24h(hourText: string, minute: string, marker: string | undefined): string {
  let hour = Number(hourText);
  const m = marker?.toUpperCase();
  if ((m === "PM" || m === "下午" || m === "午後") && hour < 12) hour += 12;
  if ((m === "AM" || m === "上午" || m === "午前") && hour === 12) hour = 0;
  return `${pad2(hour)}:${minute}`;
}

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
  if (/^\[(?:貼圖|Sticker|スタンプ)\]$/i.test(trimmed)) return "sticker";
  if (/^\[(?:照片|Photo|写真|相簿|Album)s?\]$/i.test(trimmed)) return "image";
  if (/^\[(?:影片|Video|動画)\]$/i.test(trimmed)) return "video";
  if (/^\[(?:語音訊息|Voice message|ボイスメッセージ)\]$/i.test(trimmed)) return "audio";
  if (/^\[(?:檔案|File|ファイル)\]/i.test(trimmed)) return "file";
  if (/^(?:☎|通話時間|通話|Call time|Missed call|Canceled call)/i.test(trimmed)) return "call";
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

    // A date header only counts between messages or after a blank line, so a
    // message body line that happens to be a date isn't mistaken for one.
    const headerDate = parseDateHeader(line.trim());
    const previousBlank = index === 0 || lines[index - 1].trim() === "";
    if (headerDate && (open === null || previousBlank)) {
      flush();
      currentDate = headerDate;
      return;
    }

    const messageMatch = MESSAGE_START_RE.exec(line);
    if (messageMatch) {
      flush();
      const [, markerBefore, hh, mm, markerAfter, rest] = messageMatch;
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
        time: to24h(hh, mm, markerBefore ?? markerAfter),
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
